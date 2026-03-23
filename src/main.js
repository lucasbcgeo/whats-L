require('dotenv').config();

const { client } = require("./lib/whatsappClient");
const { checkpoint } = require("./services/dedupeService");
const { syncMissedMessagesByCheckpoint } = require("./services/syncService");
const { syncHeaders } = require("./services/headerSyncService");
const { parseCommand } = require("./utils/parse");
const { isProcessed, markProcessed } = require("./core/dedupe");
const handlers = require("./handlers");
const { GROUP_ID, GROUP_NAME, FORWARD_SOURCE_NUMBERS } = require("./config/env");

async function processMessage(msg, { silent } = { silent: false }) {
    try {
        if (isProcessed(msg)) return false;

        const chat = await msg.getChat();
        const isAuthorizedDM = !chat.isGroup && FORWARD_SOURCE_NUMBERS.includes(msg.from);

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
            if (h.match({ msg, parsed, chat })) {
                if (!silent) console.log("[HANDLER EXEC]", h.constructor?.name || "handler");
                await h.handle({ msg, parsed, chat });
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
        console.error(e?.stack || e);
        return false;
    }
}

client.on("ready", async () => {
    console.log("✅ Conectado.");
    await syncMissedMessagesByCheckpoint(processMessage);
    await syncHeaders(client);
});

client.on("message_create", processMessage);

client.initialize();
