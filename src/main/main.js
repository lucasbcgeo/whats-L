require("dotenv").config();

const { parseCommand } = require("../core/parse");
const { isProcessed, markProcessed } = require("../core/dedupe");

const sono = require("../features/sono");
const alimentacao = require("../features/alimentacao");
const exercicio = require("../features/exercicio");
const games = require("../features/games");
const redes = require("../features/tempo-tela");
const procrastinacao = require("../features/procrastinacao");
const lazer = require("../features/lazer");
const ansiedade = require("../features/ansiedade");
const leitura = require("../features/leitura");
const fileForwarder = require("../features/file-forwarder");
const { syncHeaders } = require("../features/header-sync");

const { client, checkpoint, syncMissedMessagesByCheckpoint } = require("../services/whatsapp");

const handlers = [
  sono,
  alimentacao,
  exercicio,
  games,
  redes,
  procrastinacao,
  lazer,
  ansiedade,
  leitura,
  fileForwarder,
];

const GROUP_ID = process.env.GROUP_ID;
const GROUP_NAME = process.env.GROUP_NAME;

client.on("ready", async () => {
  console.log("✅ Conectado.");
  await syncMissedMessagesByCheckpoint(processMessage);
  await syncHeaders(client);
});

client.on("message_create", processMessage);

async function processMessage(msg, { silent } = { silent: false }) {
  try {
    if (isProcessed(msg)) return false;

    const chat = await msg.getChat();

    const authorizedDMs = (process.env.FORWARD_SOURCE_NUMBERS || "").split(",").map(n => n.trim());
    const isAuthorizedDM = !chat.isGroup && authorizedDMs.includes(msg.from);

    if (!chat.isGroup && !isAuthorizedDM) return false;

    if (chat.isGroup) {
      if (GROUP_ID && chat.id?._serialized !== GROUP_ID) return false;
      if (!GROUP_ID && GROUP_NAME && chat.name !== GROUP_NAME) return false;
    }

    const parsed = parseCommand(msg.body);

    if (!silent) {
      console.log("\n===== PROCESSANDO MENSAGEM =====");
      console.log("[FROM]", msg.from);
      if (chat.isGroup) console.log("[GROUP]", chat.name);
      console.log("[RAW BODY]", msg.body || "(mídia)");
      console.log("[MSG ID]", msg?.id?._serialized);
      console.log("[TIMESTAMP]", msg.timestamp);
      if (parsed) console.log("[PARSED]", parsed);
    }

    for (const h of handlers) {
      if (h.match({ msg, parsed })) {
        if (!silent) console.log("[HANDLER EXEC] Match encontrado");

        await h.handle({ msg, parsed });

        markProcessed(msg);
        checkpoint.setLastTs(msg.timestamp);

        if (!silent) console.log("[DONE] mensagem processada");
        return true;
      }
    }

    if (!silent && parsed) console.log("[NO HANDLER FOUND]", parsed.cmd);
    return false;
  } catch (e) {
    console.error("🔥 ERRO NO message handler");
    console.error(e && e.stack ? e.stack : e);
    return false;
  }
}

client.initialize();