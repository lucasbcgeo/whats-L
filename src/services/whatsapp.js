const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const GROUP_ID = process.env.GROUP_ID;
const GROUP_NAME = process.env.GROUP_NAME;
const BACKFILL_LIMIT = Number(process.env.BACKFILL_LIMIT ?? 500);

const DATA_DIR = require("path").join(__dirname, "..", "..", "data");
const CHECKPOINT_FILE = require("path").join(DATA_DIR, "checkpoint.json");
const fs = require("fs");

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

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "obsidian-life" }),
  puppeteer: { headless: true },
});

client.on("qr", (qr) => {
  console.log("Escaneie o QR no WhatsApp:");
  qrcode.generate(qr, { small: true });
});

async function getTargetGroup() {
  if (GROUP_ID) {
    try {
      const chat = await client.getChatById(GROUP_ID);
      if (chat?.isGroup) return chat;
    } catch {}
  }

  if (!GROUP_NAME) return null;
  const chats = await client.getChats();
  return chats.find((c) => c.isGroup && c.name === GROUP_NAME) || null;
}

async function getTargetChats() {
  const mainGroup = await getTargetGroup();
  const authorizedDMs = (process.env.FORWARD_SOURCE_NUMBERS || "").split(",").map(n => n.trim());

  const targetChats = [];
  if (mainGroup) targetChats.push(mainGroup);

  for (const id of authorizedDMs) {
    if (!id) continue;
    try {
      const c = await client.getChatById(id);
      if (c) targetChats.push(c);
    } catch (e) {
      console.log(`⚠️ Não foi possível carregar chat DM "${id}" para sync.`);
    }
  }

  return targetChats;
}

async function syncMissedMessagesByCheckpoint(processMessageFn) {
  const targetChats = await getTargetChats();

  if (targetChats.length === 0) {
    console.log("⚠️ Nenhum chat alvo encontrado para sync.");
    return;
  }

  let lastTs = getLastTs();
  console.log(`🔄 Sync por checkpoint. last_ts=${lastTs} | limit=${BACKFILL_LIMIT} | chats=${targetChats.length}`);

  for (const chat of targetChats) {
    console.log(`\n--- Sync chat: ${chat.name || chat.id._serialized} ---`);
    try {
      let before = undefined;
      let loops = 0;
      let processed = 0;
      let skipped = 0;

      while (loops < 50) {
        loops++;
        const opts = { limit: BACKFILL_LIMIT };
        if (before) opts.before = before;

        const batch = await chat.fetchMessages(opts);
        if (!batch || batch.length === 0) break;

        const sorted = batch.slice().sort((a, b) => a.timestamp - b.timestamp);
        if (sorted[sorted.length - 1].timestamp <= lastTs) break;

        let anyAdvanced = false;
        for (const msg of sorted) {
          if (msg.timestamp <= lastTs) continue;

          const did = await processMessageFn(msg, { silent: true });
          if (did) {
            processed++;
            anyAdvanced = true;
            setLastTs(msg.timestamp);
          } else {
            skipped++;
          }
        }

        before = sorted[0]?.id?._serialized;
        if (!anyAdvanced) break;
        lastTs = getLastTs();
      }
      console.log(`✅ Sync finalizado para este chat. processadas=${processed} ignoradas=${skipped}`);
    } catch (e) {
      console.error(`❌ Erro no sync do chat ${chat.id._serialized}:`, e && e.stack ? e.stack : e);
    }
  }
  console.log(`\n✅ Sync global finalizado. last_ts=${getLastTs()}`);
}

module.exports = {
  client,
  getTargetGroup,
  getTargetChats,
  syncMissedMessagesByCheckpoint,
  checkpoint: { getLastTs, setLastTs },
};