const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const CHECKPOINT_FILE = path.join(DATA_DIR, "checkpoint.json");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  ensureDataDir();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function getLastTs() {
  ensureDataDir();
  const j = safeReadJson(CHECKPOINT_FILE);
  const ts = Number(j?.last_ts ?? 0);
  return Number.isFinite(ts) ? ts : 0;
}

function setLastTs(ts) {
  const next = Number(ts ?? 0);
  if (!Number.isFinite(next) || next <= 0) return;
  const cur = getLastTs();
  if (next > cur) atomicWriteJson(CHECKPOINT_FILE, { last_ts: next });
}

module.exports = { getLastTs, setLastTs, checkpoint: { getLastTs, setLastTs } };
