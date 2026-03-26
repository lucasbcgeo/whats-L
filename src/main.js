const fs = require('fs');
const dotenvPath = require('path').join(__dirname, '..', '.env');

if (fs.existsSync(dotenvPath)) {
  const result = require('dotenv').config({ path: dotenvPath });
  if (result.error) {
    console.error('[DOTENV] Erro ao carregar .env:', result.error.message);
  }
} else {
  console.error('[DOTENV] Arquivo .env não encontrado em:', dotenvPath);
}

const { patchConsole } = require("./utils/logger");
patchConsole();

const { client, setShuttingDown } = require("./lib/whatsappClient");
const { checkpoint } = require("./services/dedupeService");
const { syncMissedMessagesByCheckpoint } = require("./services/syncService");
const { startWatching } = require("./services/headerWatcherService");
const { parseCommand } = require("./utils/parse");
const { isProcessed, markProcessed } = require("./core/dedupe");
const { getHandlerMetricName, saveUndoContext, undoMetric } = require("./services/undoService");
const handlers = require("./handlers");
const fileForwarderAuto = require("./handlers/file-forwarder-auto");
const { resolveProfile, isHandlerAllowed, isGroupAllowed } = require("./config/commands");

async function processMessage(msg, { silent } = { silent: false }) {
    try {
        console.log("[MSG IN]", msg?.id?._serialized, msg.type, msg.hasMedia ? "MEDIA" : "TEXT");
        if (isProcessed(msg)) return false;

        const chat = await msg.getChat();
        const profile = resolveProfile({
            groupName: chat.isGroup ? chat.name : null,
            number: !chat.isGroup ? msg.from : null,
        });

        console.log("[DEBUG] msg.from:", msg.from);
        console.log("[DEBUG] chat.isGroup:", chat.isGroup);
        console.log("[DEBUG] resolved profile:", profile);

        if (!chat.isGroup && !profile) return false;

        if (chat.isGroup && profile && !isGroupAllowed(profile, chat.name)) return false;

        const parsed = parseCommand(msg.body);

        if (!silent) {
            console.log("\n===== PROCESSANDO MENSAGEM =====");
            console.log("[FROM]", msg.from);
            if (chat.isGroup) console.log("[GROUP]", chat.name);
            console.log("[PROFILE]", profile || "none");
            console.log("[RAW BODY]", msg.body || "(mídia)");
            console.log("[MSG ID]", msg?.id?._serialized);
            console.log("[MSG TYPE]", msg.type);
            console.log("[HAS MEDIA]", msg.hasMedia);
            console.log("[TIMESTAMP]", msg.timestamp);
            if (parsed) console.log("[PARSED]", parsed);
        }

        for (const { name, handler: h } of handlers) {
            const allowed = isHandlerAllowed(profile, name);
            if (!allowed) {
                if (!silent) console.log("[HANDLER SKIP]", name, "- not allowed for profile", profile);
                continue;
            }
            console.log("[DEBUG] checking handler:", name, "allowed:", allowed);
            if (h.match({ msg, parsed, chat })) {
                if (!silent) console.log("[HANDLER EXEC]", name);
                const result = await h.handle({ msg, parsed, chat, profile });

                if (result && result.key) {
                    const metric = getHandlerMetricName(h);
                    if (metric) {
                        saveUndoContext(msg.id?._serialized, {
                            metric,
                            timestamp: msg.timestamp,
                            key: result.key,
                            value: result.value,
                        });
                    }
                }

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
    fileForwarderAuto.checkAllSources();
    await syncMissedMessagesByCheckpoint(processMessage);
    startWatching(client);
});

client.on("message_create", processMessage);

client.on("message_revoke_everyone", async (msg) => {
    const msgId = msg?.id?._serialized;
    if (!msgId) return;
    console.log("\n===== MENSAGEM APAGADA =====");
    console.log("[MSG ID]", msgId);
    const success = await undoMetric(msgId);
    if (success) {
        console.log("[UNDO] Registro revertido com sucesso.");
    } else {
        console.log("[UNDO] Nenhum registro para reverter.");
    }
});

async function shutdown(signal) {
    console.log(`\n🛑 ${signal} recebido. Desligando gracefully...`);
    setShuttingDown(true);
    try {
        await client.destroy();
        console.log("✅ Cliente WhatsApp destruído com sucesso. Sessão preservada.");
    } catch (e) {
        console.error("⚠️ Erro ao destruir cliente:", e.message);
    }
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.initialize();
