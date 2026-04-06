const { upsertRootKey, time } = require("./obsidianService");
const { parseDurationToISO } = require("../utils/duration");
const { getKey, getTriggerMapping } = require("../config");

const { toIsoMinuteZ, dateFromTsUTC, shiftDateStrUTC, getSonoDormiDate, getLocalCalendarDate, msToISODuration } = time;

function getLogicalDate(tsSeconds) {
    return time.getLogicalDate(tsSeconds, -3);
}

function ensureArray(v) {
    if (!Array.isArray(v)) v = [null, null, null];
    while (v.length < 3) v.push(null);
    return v;
}

function ensureSonoArray(v) {
    if (!Array.isArray(v)) v = [null, null, null];
    while (v.length < 3) v.push(null);
    return v.slice(0, 3);
}

function normalizeCmd(text) {
    return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function buildFoodIndexMap() {
    const mapping = getTriggerMapping("food");
    if (!mapping) return {};
    const map = {};
    for (const [subKey, config] of Object.entries(mapping)) {
        for (const variation of config.variations) {
            const norm = normalizeCmd(variation);
            map[norm] = config.index;
        }
    }
    return map;
}

const FOOD_CMD_MAP = buildFoodIndexMap();

function parseBooleanMetric(parsed, defaultValue = true) {
    if (!parsed || !parsed.args) return defaultValue;
    return !parsed.args.some(a => ["não", "nao", "no", "false"].includes(normalizeCmd(a)));
}

function parseScaleMetric(parsed) {
    if (!parsed || !parsed.args) return null;
    for (const arg of parsed.args) {
        const n = parseFloat(arg.replace(",", "."));
        if (!isNaN(n) && n >= 0 && n <= 10) return n;
    }
    return null;
}

function upsert({ dateStr, key, mutator, undo }) {
    return upsertRootKey({ dateStr, key, mutator }).then(r => ({ ...r, undo }));
}

// Maps handler names to metric types (business logic)
const METRIC_TYPES = {
    anxiety:        "scale",
    exercise:       "boolean",
    procrastination: "scale",
    leisure:        "boolean",
    reading:        "boolean",
    games:          "duration",
    screenTime:     "duration",
    food:           "food",
    sleep_bed:      "sleep_dormi",
    sleep_wake:     "sleep_acordei",
};

async function saveMetric({ metric, value, timestamp, dateStr, rawArgs, options = {} }) {
    const ts = timestamp;
    const useDateRef = options.dateRefColumn === true || options.dateRefColumn === "sim";
    const dateColumn = useDateRef ? "data_ref" : "data";
    const ds = dateStr || options.dateOverride || getLogicalDate(ts);
    const type = METRIC_TYPES[metric];

    if (!type) {
        console.log(`[METRIC_SERVICE] Metric desconhecida: ${metric}`);
        return;
    }

    const key = getKey(metric) || metric;

    switch (type) {
        case "scale": {
            const v = value ?? parseScaleMetric(rawArgs);
            if (v === null) { console.log(`[METRIC] Valor invalido (0-10) para ${metric}.`); return; }
            return await upsert({
                dateStr: ds, key,
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
                undo: { type: "scalar" },
            });
        }

        case "boolean": {
            const v = value ?? parseBooleanMetric(rawArgs, true);
            return await upsert({
                dateStr: ds, key,
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
                undo: { type: "scalar" },
            });
        }

        case "duration": {
            let text = value;
            if (!text && rawArgs?.args) {
                let args = rawArgs.args.filter(a => !["correção", "correcao", "force"].includes(normalizeCmd(a)));
                if (args[0] && ["de", "da"].includes(normalizeCmd(args[0]))) args.shift();
                if (args[0] && normalizeCmd(args[0]) === "tela") args.shift();
                text = args.join(" ");
            }
            const isoDuration = parseDurationToISO(text);
            if (!isoDuration) { console.log(`[METRIC] Duracao invalida para ${metric}.`); return; }
            return await upsert({
                dateStr: ds, key,
                mutator: (cur) => {
                    if (cur && !options.force) return cur;
                    return isoDuration;
                },
                undo: { type: "scalar" },
            });
        }

        case "food": {
            const cmd = normalizeCmd(rawArgs?.cmd || "");
            const iso = toIsoMinuteZ(ts);
            const index = FOOD_CMD_MAP[cmd] ?? -1;
            return await upsert({
                dateStr: ds, key,
                mutator: (cur) => {
                    const arr = ensureArray(cur);
                    if (index >= 0) {
                        if (arr[index] && !options.force) return arr;
                        if (arr[index] === iso) return arr;
                        arr[index] = iso;
                    } else {
                        if (arr.includes(iso)) return arr;
                        arr.push(iso);
                    }
                    return arr;
                },
                undo: { type: "array_value", value: iso },
            });
        }

        case "sleep_dormi": {
            const sleepKey = getKey("sleep") || "sono";
            const dormiuISO = toIsoMinuteZ(ts);
            const dateStrDormiu = options.dateOverride || getSonoDormiDate(ts);
            const prevDate = shiftDateStrUTC(dateStrDormiu, -1);
            const r = await upsertRootKey({
                dateStr: dateStrDormiu, key: sleepKey,
                mutator: (cur) => {
                    const sono = ensureSonoArray(cur);
                    if (sono[1] && !options.force) return sono;
                    if (sono[1] === dormiuISO) return sono;
                    sono[1] = dormiuISO;
                    if (sono[2] === undefined) sono[2] = null;
                    return sono;
                },
            });
            r.undo = {
                type: "sono",
                ops: [
                    { dateStr: dateStrDormiu, key: sleepKey, slot: 1 },
                    { dateStr: prevDate, key: sleepKey, slot: 2 },
                ],
            };
            return r;
        }

        case "sleep_acordei": {
            const sleepKey = getKey("sleep") || "sono";
            const acordouISO = toIsoMinuteZ(ts);
            const today = getLocalCalendarDate(ts);
            await upsertRootKey({
                dateStr: today, key: sleepKey,
                mutator: (cur) => {
                    const sono = ensureSonoArray(cur);
                    if (sono[0] && !options.force) return sono;
                    if (sono[0] === acordouISO) return sono;
                    sono[0] = acordouISO;
                    return sono;
                },
            });
            const prevDate = shiftDateStrUTC(today, -1);
            const r = await upsertRootKey({
                dateStr: prevDate, key: sleepKey,
                mutator: (cur) => {
                    const sono = ensureSonoArray(cur);
                    const dormiuISO = sono[1];
                    if (!dormiuISO) return sono;
                    const dormiuMs = Date.parse(dormiuISO.replace("Z", ":00Z"));
                    const acordouMs = Date.parse(acordouISO.replace("Z", ":00Z"));
                    if (Number.isNaN(dormiuMs) || Number.isNaN(acordouMs) || acordouMs <= dormiuMs) return sono;
                    const durationISO = msToISODuration(acordouMs - dormiuMs);
                    if (sono[2] === durationISO) return sono;
                    sono[2] = durationISO;
                    return sono;
                },
            });
            r.undo = {
                type: "sono",
                ops: [
                    { dateStr: today, key: sleepKey, slot: 0 },
                    { dateStr: prevDate, key: sleepKey, slot: 2 },
                ],
            };
            return r;
        }

        default:
            console.log(`[METRIC_SERVICE] Tipo desconhecido: ${type} para ${metric}`);
            return;
    }
}

module.exports = { saveMetric, metricService: { saveMetric } };
