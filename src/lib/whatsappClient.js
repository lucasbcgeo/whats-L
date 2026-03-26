const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { GROUP_ID } = require("../config/env");
const { data } = require("../config");

let reconnectAttempts = 0;
const MAX_RECONNECT = 10;
let shuttingDown = false;

const client = new Client({
  authStrategy: new LocalAuth({ 
    clientId: "obsidian-life-v3",
    dataPath: path.join(__dirname, '..', '..', '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions'
    ]
  }
});

client.on("qr", (qr) => {
  console.log("Escaneie o QR no WhatsApp:");
  qrcode.generate(qr, { small: true });
});

client.on("auth_failure", (msg) => {
  console.error("❌ Auth failure:", msg);
});

client.on("disconnected", (reason) => {
  console.log("[WHATSAPP] Desconectado:", reason);
  if (!shuttingDown) scheduleReconnect();
});

client.on("remote_session_saved", () => {
  console.log("Sessão salva");
});

client.on("ready", () => {
  reconnectAttempts = 0;
  console.log("[WHATSAPP] Cliente pronto.");
});

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.error("[WHATSAPP] Máximo de reconexões atingido. Reinicie o processo.");
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(5000 * reconnectAttempts, 60000);
  console.log(`[WHATSAPP] Reconectando em ${delay / 1000}s (${reconnectAttempts}/${MAX_RECONNECT})...`);
  setTimeout(async () => {
    try {
      await client.destroy();
    } catch {}
    try {
      await client.initialize();
    } catch (e) {
      console.error("[WHATSAPP] Falha ao reconectar:", e.message);
      scheduleReconnect();
    }
  }, delay);
}

async function getTargetGroup() {
  if (GROUP_ID) {
    try {
      const chat = await client.getChatById(GROUP_ID);
      if (chat?.isGroup) return chat;
    } catch {}
  }

  const adminGroupName = data.profiles?.admin?.match?.groupName;
  if (!adminGroupName) return null;
  const chats = await client.getChats();
  const target = chats.find((c) => c.isGroup && c.name === adminGroupName);
  return target || null;
}

async function getTargetChats(additionalIds = []) {
  const mainGroup = await getTargetGroup();
  const targetChats = [];
  if (mainGroup) targetChats.push(mainGroup);

  for (const id of additionalIds) {
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

module.exports = {
  client,
  getTargetGroup,
  getTargetChats,
  setShuttingDown: (v) => { shuttingDown = v; },
};
