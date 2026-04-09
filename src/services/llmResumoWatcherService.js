const fs = require("fs");
const path = require("path");
const { processar: processarResumo } = require("./llmResumoService");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "llm_resumo_watcher_state.json");

let llmProcessing = false;
let watcher = null;
let debounceTimer = null;
let clientRef = null;

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch { return {}; }
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (e) { console.error("Erro ao salvar estado do llmResumoWatcher:", e.message); }
}

function isClientReady(client) {
    try {
        return client && client.pupPage && !client.pupPage.isClosed();
    } catch {
        return false;
    }
}

function getPrePath() {
    return "G:/Franklin/Outros/Guias/PRÉ Resumo Whatsapp.md";
}

async function processPreFile() {
    if (llmProcessing) {
        console.log("[LLM RESUMO WATCHER] LLM ja processando, ignorando mudanca no PRE.");
        return;
    }

    llmProcessing = true;
    try {
        const prePath = getPrePath();
        if (!fs.existsSync(prePath)) {
            console.log("[LLM RESUMO WATCHER] Arquivo PRE nao encontrado. Pulando.");
            return;
        }

        console.log("[LLM RESUMO WATCHER] PRE alterado. Chamando LLM para atualizar resumo...");
        const result = await processarResumo();
        console.log(`[LLM RESUMO WATCHER] LLM: ${result.message}`);

        const state = loadState();
        state.lastProcessed = new Date().toISOString();
        state.lastResult = result.success ? "success" : "error";
        saveState(state);
    } catch (e) {
        console.error("[LLM RESUMO WATCHER] Erro ao processar PRE:", e.message);
    } finally {
        llmProcessing = false;
    }
    console.log("[LLM RESUMO WATCHER] Processo terminado, livre para nova requisição.");
}

function startWatching(client) {
    clientRef = client;
    stopWatching();

    const prePath = getPrePath();

    if (!fs.existsSync(prePath)) {
        console.warn(`[LLM RESUMO WATCHER] Arquivo nao encontrado: ${prePath}. Watcher nao iniciado.`);
        return;
    }

    const runInitialSync = () => {
        if (!isClientReady(clientRef)) {
            console.log("[LLM RESUMO WATCHER] Aguardando cliente ficar pronto...");
            setTimeout(runInitialSync, 2000);
            return;
        }
        processPreFile().catch(e => {
            console.error("[LLM RESUMO WATCHER] Erro no sync inicial:", e.message);
        });
    };

    runInitialSync();

    watcher = fs.watch(prePath, { persistent: true }, (eventType) => {
        if (eventType !== "change") return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                if (!isClientReady(clientRef)) {
                    console.warn("[LLM RESUMO WATCHER] Cliente nao esta pronto. Ignorando mudanca.");
                    return;
                }
                await processPreFile();
            } catch (e) {
                console.error("[LLM RESUMO WATCHER] Erro durante sync:", e.message);
            }
        }, 1500);
    });

    console.log(`[LLM RESUMO WATCHER] Monitorando: ${prePath}`);
}

function stopWatching() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    clearTimeout(debounceTimer);
    debounceTimer = null;
}

module.exports = {
    startWatching,
    stopWatching,
    processPreFile,
};
