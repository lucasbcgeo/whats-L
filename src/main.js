const fs = require('fs');
const dotenvPath = require('path').join(__dirname, '..', '.env');

if (fs.existsSync(dotenvPath)) {
  const result = require('dotenv').config({ path: dotenvPath, override: true });
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

async function processMessage(msg, { silent, force } = { silent: false, force: false }) {
    try {
        console.log("[MSG IN]", msg?.id?._serialized, msg.type, msg.hasMedia ? "MEDIA" : "TEXT");
        if (!force && isProcessed(msg)) return false;

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

                if (!silent) {
                    markProcessed(msg);
                    checkpoint.setLastTs(msg.timestamp);
                    console.log("[DONE] mensagem processada");
                }
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

async function runBackfillOnStart(processMessageFn, client) {
    const { checkpoint } = require("./services/dedupeService");
    const { smartBackfill } = require("./services/smartBackfillService");
    const checkpointBefore = checkpoint.getLastTs();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const timeDiff = nowSeconds - checkpointBefore;
    const MAX_BACKFILL_GAP = 300;
    
    console.log(`[BACKFILL] checkpoint antes: ${checkpointBefore} | agora: ${nowSeconds} | diferença: ${timeDiff}s`);
    
    if (timeDiff <= MAX_BACKFILL_GAP) {
        console.log(`[BACKFILL] Apenas ${timeDiff}s desde última execução. Pulando backfill.`);
        return;
    }
    
    console.log(`[BACKFILL] Processando mensagens por profile (últimos ${Math.floor(timeDiff/60)}min)...`);
    try {
        await smartBackfill(processMessageFn, client);
    } catch (e) {
        console.error("[BACKFILL] Erro ao processar retroativo:", e.message);
    }
}

client.on("ready", async () => {
    console.log("✅ Conectado.");
    const WARMUP_INITIAL_DELAY = 5000;
    const WARMUP_POLL_INTERVAL = 3000;
    const WARMUP_MAX_POLLS = 10;
    const WARMUP_STABLE_COUNT = 2;

    console.log(`[READY] Aguardando ${WARMUP_INITIAL_DELAY / 1000}s para WhatsApp Web estabilizar...`);
    await new Promise(r => setTimeout(r, WARMUP_INITIAL_DELAY));

    let prevCount = -1;
    let stableHits = 0;
    for (let i = 0; i < WARMUP_MAX_POLLS; i++) {
        try {
            const chats = await client.getChats();
            const count = chats.length;
            console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: ${count} chats carregados`);
            if (count === prevCount && count > 0) {
                stableHits++;
                if (stableHits >= WARMUP_STABLE_COUNT) {
                    console.log(`[WARMUP] Chat count estabilizou em ${count}. Pronto.`);
                    break;
                }
            } else {
                stableHits = 0;
            }
            prevCount = count;
        } catch (e) {
            console.log(`[WARMUP] Poll ${i + 1} falhou: ${e.message}`);
        }
        if (i < WARMUP_MAX_POLLS - 1) {
            await new Promise(r => setTimeout(r, WARMUP_POLL_INTERVAL));
        }
    }
    if (stableHits < WARMUP_STABLE_COUNT) {
        console.log(`[WARMUP] Chat count não estabilizou após ${WARMUP_MAX_POLLS} polls. Prosseguindo mesmo assim.`);
    }

    try {
        loadIgnoreList();
        await syncMissedMessagesByCheckpoint(processMessage);
    } catch (e) {
        console.error("[READY] Erro no sync:", e.message);
    }
    try {
        await runBackfillOnStart(processMessage, client);
    } catch (e) {
        console.error("[READY] Erro no backfill:", e.message);
    }
    try {
        startWatching(client);
        console.log("[READY] Header watcher iniciado");
    } catch (e) {
        console.error("[READY] Erro header watcher:", e.message);
    }
    try {
        startLlmResumoWatching(client);
        console.log("[READY] LLM Resumo watcher iniciado");
    } catch (e) {
        console.error("[READY] Erro LLM Resumo (não bloqueia app):", e.message);
    }
    console.log("[READY] Todos os serviços iniciados!");
});

client.on("message_create", async (msg) => {
    console.log("[EVENT] message_create received from:", msg.from, "type:", msg.type);
    try {
        const chat = await msg.getChat();
        
        if (chat.isGroup && shouldIgnoreGroup(chat.name)) {
            console.log("[EVENT] Ignored group:", chat.name);
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
