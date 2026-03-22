const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "..", "..", "data", "processed.json");

function ensureDir() {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
}

function defaultDb() {
    return { messages: {} };
}

function safeReadJson(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const txt = fs.readFileSync(filePath, "utf8").trim();
        if (!txt) return null;
        return JSON.parse(txt);
    } catch {
        return null;
    }
}

function atomicWriteJson(filePath, obj) {
    ensureDir();
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
}

function load() {
    ensureDir();
    const db = safeReadJson(FILE);
    if (db && typeof db === "object" && db.messages && typeof db.messages === "object") return db;

    const fresh = defaultDb();
    atomicWriteJson(FILE, fresh);
    return fresh;
}

function save(db) {
    atomicWriteJson(FILE, db);
}

function getId(msg) {
    return msg?.id?._serialized || msg?.id?.id || null;
}

function isProcessed(msg) {
    const id = getId(msg);
    if (!id) return false;
    const db = load();
    return Boolean(db.messages[id]);
}

function markProcessed(msg) {
    const id = getId(msg);
    if (!id) return;

    const db = load();
    const now = Math.floor(Date.now() / 1000);
    const ttl = Number(process.env.DEDUPE_TTL ?? 72 * 3600);

    db.messages[id] = now;

    for (const [k, ts] of Object.entries(db.messages)) {
        if (now - ts > ttl) delete db.messages[k];
    }

    save(db);
}

module.exports = { isProcessed, markProcessed };

