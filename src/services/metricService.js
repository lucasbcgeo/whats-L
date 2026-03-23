const { upsertRootKey, time } = require("./obsidianService");
const { parseDurationToISO } = require("../utils/duration");

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

async function saveMetric({ metric, value, timestamp, dateStr, rawArgs, options = {} }) {
    const ts = timestamp;
    const ds = dateStr || getLogicalDate(ts);

    switch (metric) {
        case "ansiedade": {
            const v = value ?? parseScaleMetric(rawArgs);
            if (v === null) { console.log("[ANSIEDADE] Valor invalido (0-10)."); return; }
            return await upsertRootKey({
                dateStr: ds, key: "ansiedade",
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
            });
        }

        case "exercicio": {
            const v = value ?? parseBooleanMetric(rawArgs, true);
            return await upsertRootKey({
                dateStr: ds, key: "exercicio",
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
            });
        }

        case "procrastinacao": {
            const v = value ?? parseScaleMetric(rawArgs);
            if (v === null) { console.log("[PROCRASTINACAO] Valor invalido (0-10)."); return; }
            return await upsertRootKey({
                dateStr: ds, key: "procrastinacao",
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
            });
        }

        case "lazer": {
            const v = value ?? parseBooleanMetric(rawArgs, true);
            return await upsertRootKey({
                dateStr: ds, key: "lazer",
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
            });
        }

        case "leitura": {
            const v = value ?? parseBooleanMetric(rawArgs, true);
            return await upsertRootKey({
                dateStr: ds, key: "leitura",
                mutator: (cur) => {
                    if (cur !== undefined && cur !== null && !options.force) return cur;
                    return v;
                },
            });
        }

        case "games": {
            const text = value || (rawArgs?.args || []).filter(a => !["correção", "correcao", "force"].includes(normalizeCmd(a))).join(" ");
            const isoDuration = parseDurationToISO(text);
            if (!isoDuration) { console.log("[GAMES] Duracao invalida."); return; }
            return await upsertRootKey({
                dateStr: ds, key: "games",
                mutator: (cur) => {
                    if (cur && !options.force) return cur;
                    return isoDuration;
                },
            });
        }

        case "tempo_tela": {
            let text = value;
            if (!text && rawArgs?.args) {
                let args = rawArgs.args.filter(a => !["correção", "correcao", "force"].includes(normalizeCmd(a)));
                if (args[0] && ["de", "da"].includes(normalizeCmd(args[0]))) args.shift();
                if (args[0] && normalizeCmd(args[0]) === "tela") args.shift();
                text = args.join(" ");
            }
            const isoDuration = parseDurationToISO(text);
            if (!isoDuration) { console.log("[TEMPO_TELA] Duracao invalida."); return; }
            return await upsertRootKey({
                dateStr: ds, key: "tempo_tela",
                mutator: (cur) => {
                    if (cur && !options.force) return cur;
                    return isoDuration;
                },
            });
        }

        case "alimentacao": {
            const cmd = normalizeCmd(rawArgs?.cmd || "");
            const iso = toIsoMinuteZ(ts);
            let index = -1;
            if (cmd === "cafe") index = 0;
            if (cmd === "almoco") index = 1;
            if (cmd === "janta") index = 2;
            return await upsertRootKey({
                dateStr: ds, key: "alimentacao",
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
            });
        }

        case "sono_dormi": {
            const dormiuISO = toIsoMinuteZ(ts);
            const dateStrDormiu = options.dateStr || getSonoDormiDate(ts);
            return await upsertRootKey({
                dateStr: dateStrDormiu, key: "sono",
                mutator: (cur) => {
                    const sono = ensureSonoArray(cur);
                    if (sono[1] && !options.force) return sono;
                    if (sono[1] === dormiuISO) return sono;
                    sono[1] = dormiuISO;
                    if (sono[2] === undefined) sono[2] = null;
                    return sono;
                },
            });
        }

        case "sono_acordei": {
            const acordouISO = toIsoMinuteZ(ts);
            const today = getLocalCalendarDate(ts);
            await upsertRootKey({
                dateStr: today, key: "sono",
                mutator: (cur) => {
                    const sono = ensureSonoArray(cur);
                    if (sono[0] && !options.force) return sono;
                    if (sono[0] === acordouISO) return sono;
                    sono[0] = acordouISO;
                    return sono;
                },
            });
            const prevDate = shiftDateStrUTC(today, -1);
            return await upsertRootKey({
                dateStr: prevDate, key: "sono",
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
        }

        default:
            console.log(`[METRIC_SERVICE] Metric desconhecida: ${metric}`);
            return;
    }
}

module.exports = { saveMetric, metricService: { saveMetric } };
