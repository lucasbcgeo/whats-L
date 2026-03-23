const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { GROUP_ID, GROUP_NAME } = require("../config/env");

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
};
