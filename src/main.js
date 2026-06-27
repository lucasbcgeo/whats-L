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
const { startCheckpointRecovery } = require("./services/checkpointRecoveryService");
const { startWatching } = require("./services/headerWatcherService");
const { startWatching: startLlmResumoWatching } = require("./services/llmResumoWatcherService");
const { parseCommand } = require("./utils/parse");
const { isProcessed, markProcessed } = require("./core/dedupe");
const { getHandlerMetricName, saveUndoContext, undoMetric } = require("./services/undoService");
const { resolveMessageProfile, getMessageSenderId, isGroupAllowed, data } = require("./config");
const { startServer: startOutboundServer, stopServer: stopOutboundServer } = require("./services/outboundServer");

const groupIgnoreList = [
    "Boa Viagem",
    "Monitoramento_quadra"
];

let stopCheckpointRecovery = () => {};

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
        const profile = await resolveMessageProfile({
            groupName: chat.isGroup ? chat.name : null,
            number: getMessageSenderId(msg, chat.isGroup),
        }, client);

        console.log("[DEBUG] msg.from:", msg.from);
        console.log("[DEBUG] chat.isGroup:", chat.isGroup);
        console.log("[DEBUG] resolved profile:", profile);

        const parsed = parseCommand(msg.body);

        if (parsed?.cmd === "agenda") {
            try {
                const agendaHandler = require("./handlers/agenda");
                if (agendaHandler.match({ msg, parsed, chat, profile })) {
                    if (silent && agendaHandler.replaySafe === false) {
                        console.log("[SYNC] Handler não seguro para replay, marcando sem executar: agenda");
                        markProcessed(msg);
                        checkpoint.setLastTs(msg.timestamp);
                        return true;
                    }

                    await agendaHandler.handle({ msg, parsed, chat, profile });
                    markProcessed(msg);
                    checkpoint.setLastTs(msg.timestamp);
                    return true;
                }
            } catch (e) {
                console.error("[AGENDA] erro no hook pre-profile:", e.message);
            }
        }

        if (!chat.isGroup && !profile) return false;

        if (chat.isGroup && profile && !isGroupAllowed(profile, chat.name)) return false;

        const profileHandlers = getProfileHandlers(profile);
        
        if (!silent && profileHandlers.length > 0) {
            console.log(`[PROFILE HANDLERS] ${profile}: ${profileHandlers.map(h => h.name).join(', ')}`);
        }

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
                if (silent && h.replaySafe === false) {
                    console.log("[SYNC] Handler não seguro para replay, marcando sem executar:", name);
                    markProcessed(msg);
                    checkpoint.setLastTs(msg.timestamp);
                    return true;
                }

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

                if (!silent) {
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

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getErrorMessage(e) {
    return e?.message || String(e);
}

function isTransientBrowserError(e) {
    const msg = getErrorMessage(e);
    return [
        "Target closed",
        "detached Frame",
        "Frame was detached",
        "Session expired",
        "Execution context was destroyed",
        "Cannot find context with specified id",
        "Protocol error (Runtime.callFunctionOn)",
    ].some(pattern => msg.includes(pattern));
}

function describeTransientBrowserError(e) {
    const msg = getErrorMessage(e);
    if (msg.includes("detached Frame") || msg.includes("Frame was detached")) return "frame reiniciado";
    if (msg.includes("Target closed")) return "target fechado";
    if (msg.includes("Session expired")) return "sessão expirada";
    if (msg.includes("Execution context was destroyed")) return "contexto reiniciado";
    if (msg.includes("Protocol error (Runtime.callFunctionOn)")) return "runtime indisponível";
    return "navegador reiniciando";
}

function isClientPageOpen(client) {
    try {
        return Boolean(client?.pupPage && !client.pupPage.isClosed());
    } catch {
        return false;
    }
}

async function getClientStateSafe(client) {
    try {
        return await client.getState();
    } catch (e) {
        if (isTransientBrowserError(e)) return null;
        throw e;
    }
}

async function waitForWhatsAppWarmup(client) {
    const WARMUP_INITIAL_DELAY = 5000;
    const WARMUP_POLL_INTERVAL = 3000;
    const WARMUP_MAX_POLLS = 10;
    const WARMUP_STABLE_COUNT = 2;

    console.log(`[READY] Aguardando ${WARMUP_INITIAL_DELAY / 1000}s para WhatsApp Web estabilizar...`);
    await sleep(WARMUP_INITIAL_DELAY);

    let prevCount = -1;
    let stableHits = 0;
    let successfulPolls = 0;

    const resetStability = () => {
        prevCount = -1;
        stableHits = 0;
    };

    for (let i = 0; i < WARMUP_MAX_POLLS; i++) {
        try {
            if (!isClientPageOpen(client)) {
                resetStability();
                console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: página do WhatsApp ainda indisponível`);
                if (i < WARMUP_MAX_POLLS - 1) await sleep(WARMUP_POLL_INTERVAL);
                continue;
            }

            const state = await getClientStateSafe(client);
            if (state === null) {
                resetStability();
                console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: estado ainda indisponível; aguardando`);
                if (i < WARMUP_MAX_POLLS - 1) await sleep(WARMUP_POLL_INTERVAL);
                continue;
            }
            if (state && state !== "CONNECTED") {
                resetStability();
                console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: estado=${state}; aguardando conexão`);
                if (i < WARMUP_MAX_POLLS - 1) await sleep(WARMUP_POLL_INTERVAL);
                continue;
            }

            const chats = await client.getChats();
            const count = chats.length;
            successfulPolls++;
            console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: ${count} chats carregados`);
            if (count === prevCount && count > 0) {
                stableHits++;
                if (stableHits >= WARMUP_STABLE_COUNT) {
                    console.log(`[WARMUP] Chat count estabilizou em ${count}. Pronto.`);
                    return true;
                }
            } else {
                stableHits = 0;
            }
            prevCount = count;
        } catch (e) {
            resetStability();
            if (isTransientBrowserError(e)) {
                console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS}: navegador ainda instável (${describeTransientBrowserError(e)}); tentando novamente`);
            } else {
                console.log(`[WARMUP] Poll ${i + 1}/${WARMUP_MAX_POLLS} falhou: ${getErrorMessage(e)}`);
            }
        }
        if (i < WARMUP_MAX_POLLS - 1) {
            await sleep(WARMUP_POLL_INTERVAL);
        }
    }

    if (successfulPolls === 0) {
        console.log("[WARMUP] Nenhum poll conseguiu ler chats. Aguardando próxima reconexão antes de iniciar serviços.");
        return false;
    }

    if (stableHits < WARMUP_STABLE_COUNT) {
        console.log(`[WARMUP] Chat count não estabilizou após ${WARMUP_MAX_POLLS} polls. Prosseguindo mesmo assim.`);
    }
    return true;
}

client.on("ready", async () => {
    console.log("✅ Conectado.");
    const warmupOk = await waitForWhatsAppWarmup(client);
    if (!warmupOk) return;

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
    try {
        startOutboundServer(client);
        console.log("[READY] Outbound server iniciado");
    } catch (e) {
        console.error("[READY] Erro outbound server (não bloqueia app):", e.message);
    }
    stopCheckpointRecovery();
    stopCheckpointRecovery = startCheckpointRecovery(() => syncMissedMessagesByCheckpoint(processMessage));
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
    stopCheckpointRecovery();
    try {
        await stopOutboundServer();
    } catch (e) {
        console.error("⚠️ Erro ao fechar outbound server:", e.message);
    }
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
