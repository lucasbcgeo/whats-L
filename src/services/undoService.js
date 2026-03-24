const fs = require("fs-extra");
const path = require("path");
const { upsertRootKey, time } = require("./obsidianService");
const { removeTaskFromSection } = require("../lib/obsidianClient");

const FILE = path.join(__dirname, "..", "..", "data", "undo.json");

const HANDLER_TO_METRIC = {
    food: "alimentacao",
    sleep: "sono",
    exercise: "exercicio",
    games: "games",
    "screen-time": "tempo_tela",
    procrastination: "procrastinacao",
    leisure: "lazer",
    anxiety: "ansiedade",
    reading: "leitura",
    task: "tarefa",
};

function getHandlerMetricName(handler) {
    for (const [filename, metric] of Object.entries(HANDLER_TO_METRIC)) {
        if (handler === require(`../handlers/${filename}`)) return metric;
    }
    return null;
}

function load() {
    try {
        if (!fs.existsSync(FILE)) return {};
        return JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch { return {}; }
}

function save(db) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2), "utf8");
}

function saveUndoContext(msgId, context) {
    if (!msgId) return;
    const db = load();
    db[msgId] = context;
    save(db);
    console.log("[UNDO] Contexto salvo:", msgId, "→", context.metric);
}

function removeUndoContext(msgId) {
    const db = load();
    delete db[msgId];
    save(db);
}

function getUndoContext(msgId) {
    const db = load();
    return db[msgId] || null;
}

async function undoScalar(dateStr, key) {
    await upsertRootKey({
        dateStr, key,
        mutator: () => null,
    });
}

async function undoArrayValue(dateStr, key, value) {
    await upsertRootKey({
        dateStr, key,
        mutator: (cur) => {
            if (!Array.isArray(cur)) return cur;
            return cur.filter(v => v !== value);
        },
    });
}

async function undoSono(ops) {
    for (const op of ops) {
        await upsertRootKey({
            dateStr: op.dateStr, key: op.key,
            mutator: (cur) => {
                if (!Array.isArray(cur)) return cur;
                const sono = [...cur];
                while (sono.length < 3) sono.push(null);
                sono[op.slot] = null;
                return sono;
            },
        });
    }
}

async function undoTarefa(dateStr, taskText) {
    await removeTaskFromSection({ dateStr, taskText });
}

async function undoMetric(msgId) {
    const ctx = getUndoContext(msgId);
    if (!ctx) {
        console.log("[UNDO] Nenhum contexto para msgId:", msgId);
        return false;
    }

    const { metric, timestamp, key, value, undo } = ctx;
    const dateStr = time.getLogicalDate(timestamp, -3);
    console.log("[UNDO] Revertendo:", metric, "em", dateStr);

    try {
        if (metric === "tarefa") {
            await undoTarefa(dateStr, value);
        } else if (undo) {
            switch (undo.type) {
                case "scalar":
                    await undoScalar(dateStr, key);
                    break;
                case "array_value":
                    await undoArrayValue(dateStr, key, undo.value);
                    break;
                case "sono":
                    await undoSono(undo.ops);
                    break;
                default:
                    console.log("[UNDO] Tipo desconhecido:", undo.type);
                    return false;
            }
        } else {
            console.log("[UNDO] Sem undo spec para:", metric);
            return false;
        }

        removeUndoContext(msgId);
        console.log("[UNDO] Sucesso:", metric, "revertido");
        return true;
    } catch (e) {
        console.error("[UNDO] Erro:", e.message);
        return false;
    }
}

module.exports = { getHandlerMetricName, saveUndoContext, undoMetric };
