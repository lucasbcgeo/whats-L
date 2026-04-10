const path = require("path");
const qrcode = require("qrcode-terminal");
const Message = require('whatsapp-web.js/src/structures/Message');
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
    if (id.includes("@lid")) {
      console.log(`⚠️ Pulando LID inválido: "${id}"`);
      continue;
    }
    try {
      const c = await client.getChatById(id);
      if (c) targetChats.push(c);
    } catch (e) {
      console.log(`⚠️ Não foi possível carregar chat DM "${id}" para sync: ${e.message}`);
    }
  }

  return targetChats;
}

async function fetchChatMessages(chatId, limit) {
    let messages = await client.pupPage.evaluate(
        async (chatId, limit) => {
            const msgFilter = (m) => {
                if (m.isNotification) return false;
                return true;
            };

            const chatWid = window.require('WAWebWidFactory').createWid(chatId);
            const ChatCollection = window.require('WAWebCollections').Chat;

            let chat = ChatCollection.get(chatWid);

            if (!chat) {
                try {
                    const allChats = ChatCollection.getModelsArray();
                    chat = allChats.find(c => {
                        try { return c.id && c.id.equals(chatWid); } catch { return false; }
                    });
                } catch {}
            }

            if (!chat) {
                try {
                    const allChats = ChatCollection.getModelsArray();
                    chat = allChats.find(c => c.id?._serialized === chatId);
                } catch {}
            }

            if (!chat) {
                try {
                    const result = await window.require('WAWebFindChatAction')
                        .findOrCreateLatestChat(chatWid);
                    chat = result?.chat;
                } catch (e) {
                    return { error: 'chat_not_found', detail: e.message || String(e) };
                }
            }

            if (!chat) {
                return { error: 'chat_not_found', detail: 'chat object null after all lookups' };
            }

            let msgs = chat.msgs.getModelsArray().filter(msgFilter);

            if (limit > 0 && msgs.length < limit) {
                try {
                    const loadedMessages = await window
                        .require('WAWebChatLoadMessages')
                        .loadEarlierMsgs(chat, chat.msgs);
                    if (loadedMessages && loadedMessages.length) {
                        msgs = [...loadedMessages.filter(msgFilter), ...msgs];
                    }
                } catch {}
            }

            if (limit > 0 && msgs.length > limit) {
                msgs.sort((a, b) => (a.t > b.t ? 1 : -1));
                msgs = msgs.splice(msgs.length - limit);
            }

            return msgs.map((m) => window.WWebJS.getMessageModel(m));
        },
        chatId,
        limit
    );

    if (messages && messages.error) {
        const err = new Error(messages.detail || messages.error);
        err.code = messages.error;
        throw err;
    }

return messages.map((m) => new Message(client, m));
}

module.exports = {
  client,
  getTargetGroup,
  getTargetChats,
  fetchChatMessages,
  setShuttingDown: (v) => { shuttingDown = v; },
};
