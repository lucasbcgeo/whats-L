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
const { startWatching: startLlmResumoWatching } = require("./services/llmResumoWatcherService");
const { parseCommand } = require("./utils/parse");
const { isProcessed, markProcessed } = require("./core/dedupe");
const { getHandlerMetricName, saveUndoContext, undoMetric } = require("./services/undoService");
const { resolveProfile, isGroupAllowed, data } = require("./config");

const groupIgnoreList = [
    "Boa Viagem",
    "Monitoramento_quadra"
];

function loadIgnoreList() {
    const labels = data.labels?.groups || {};
    for (const [key, config] of Object.entries(labels)) {
        if (config.label && config.silence === "true") {
            if (!groupIgnoreList.includes(config.label)) {
                groupIgnoreList.push(config.label);
            }
        }
    }
    console.log("[GROUP IGNORE LIST]", groupIgnoreList);
}

function shouldIgnoreGroup(groupName) {
    for (const label of groupIgnoreList) {
        for (const configLabel of Object.values(data.labels?.groups || {})) {
            if (configLabel.label === label) {
                for (const name of configLabel.groupNames || []) {
                    if (groupName.includes(name) || name.includes(groupName)) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

const servicesCache = {};
const handlersCache = {};

function loadService(serviceName) {
    if (servicesCache[serviceName]) return servicesCache[serviceName];
    
    try {
        const servicePath = `./services/${serviceName}`;
        const Service = require(servicePath);
        servicesCache[serviceName] = Service;
        console.log(`[SERVICE LOADED] ${serviceName}`);
        return Service;
    } catch (e) {
        console.error(`[SERVICE ERROR] ${serviceName}:`, e.message);
        return null;
    }
}

const path = require("path");

function loadHandler(handlerName) {
    if (handlersCache[handlerName]) return handlersCache[handlerName];
    
    const handlersDir = path.join(__dirname, "handlers");
    const files = fs.readdirSync(handlersDir);
    
    // Procura arquivo que corresponde ao handler (sem extensão .js)
    const targetFile = files.find(f => {
        const name = f.replace(".js", "");
        // Compara ignoring case e alguns padrões comuns
        const lowerHandler = handlerName.toLowerCase();
        const lowerFile = name.toLowerCase();
        return lowerFile.includes(lowerHandler) || 
               lowerHandler.replace(/whats/g, "whats").replace(/to/g, "to") === lowerFile.replace(/-/g, "").replace(/_/g, "") ||
               name === handlerName;
    });
    
    if (targetFile) {
        try {
            const handler = require(`./handlers/${targetFile}`);
            handlersCache[handlerName] = handler;
            console.log(`[HANDLER LOADED] ${handlerName} -> ${targetFile}`);
            return handler;
        } catch (e) {
            console.error(`[HANDLER ERROR] ${handlerName}: erro ao carregar ${targetFile}:`, e.message);
        }
    }
    
    console.error(`[HANDLER ERROR] ${handlerName}: não encontrado`);
    return null;
}

function getProfileHandlers(profileName) {
    const profile = data.profiles?.[profileName];
    if (!profile) return [];
    
    const handlers = [];
    const features = profile.features || [];
    
    for (const featureName of features) {
        const feature = data.features?.[featureName];
        if (!feature) continue;
        
        if (feature.commands) {
            for (const cmd of feature.commands) {
                const cmdConfig = data.commands?.[cmd];
                if (cmdConfig?.handler) {
                    const handler = loadHandler(cmdConfig.handler);
                    if (handler) {
                        handlers.push({ name: cmd, handler });
                    }
                }
            }
        }
        
        if (feature.service) {
            const Service = loadService(feature.service);
            if (Service) {
                console.log(`[FEATURE SERVICE] ${featureName} -> ${feature.service}`);
            }
        }
    }
    
    return handlers;
}

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

        const profileHandlers = getProfileHandlers(profile);
        
        if (!silent && profileHandlers.length > 0) {
            console.log(`[PROFILE HANDLERS] ${profile}: ${profileHandlers.map(h => h.name).join(', ')}`);
        }

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

        for (const { name, handler: h } of profileHandlers) {
            const matchResult = h.match({ msg, parsed, chat, profile });
            console.log("[DEBUG] checking handler:", name, "- match:", matchResult);
            if (matchResult) {
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
    loadIgnoreList();
    await syncMissedMessagesByCheckpoint(processMessage);
    startWatching(client);
    startLlmResumoWatching(client);
});

client.on("message_create", async (msg) => {
    try {
        const chat = await msg.getChat();
        
        if (chat.isGroup && shouldIgnoreGroup(chat.name)) {
            return;
        }
        
        await processMessage(msg);
    } catch (e) {
        console.error("[MESSAGE CREATE ERROR]", e.message);
    }
});

module.exports = { getProfileHandlers, processMessage };

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
