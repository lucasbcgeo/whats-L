const fs = require("fs");
const path = require("path");
const { getFileWatcherConfig } = require("../config");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "header_watcher_state.json");

let cachedGroupId = null;
let cachedGroupName = null;

async function resolveTargetGroup(client, groupName) {
    if (cachedGroupId && cachedGroupName === groupName) {
        try {
            const chat = await client.getChatById(cachedGroupId);
            if (chat) return chat;
        } catch { cachedGroupId = null; cachedGroupName = null; }
    }
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === groupName);
    if (group) {
        cachedGroupId = group.id._serialized;
        cachedGroupName = groupName;
    }
    return group;
}

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
    } catch (e) { console.error("⚠️ Erro ao salvar estado do headerWatcher:", e.message); }
}

function stripComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function mdToWhatsApp(text) {
    return text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, "_$1_");
}

function parseMarkdown(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf8");
    const parts = content.split(/^###\s+/m);
    const results = [];
    for (let i = 1; i < parts.length; i++) {
        const lines = parts[i].split("\n");
        const title = lines[0].trim().replace(/"/g, "").trim();
        const bodyRaw = lines.slice(1).join("\n");
        const body = stripComments(bodyRaw).replace(/\n---\s*$/, "").trim();
        if (body) results.push({ title, body });
    }
    return results;
}

function getWatcherConfig() {
    return getFileWatcherConfig();
}

function isClientReady(client) {
    try {
        return client && client.pupPage && !client.pupPage.isClosed();
    } catch {
        return false;
    }
}

async function syncFranklinHeaders(client) {
    if (!isClientReady(client)) {
        console.warn("[HEADER WATCHER] Cliente não está pronto. Pulando sync.");
        return;
    }

    const config = getWatcherConfig();
    if (!config) {
        console.warn("⚠️ Perfil secretário_franklin não configurado. Pulando watcher.");
        return;
    }

    let targetGroup;
    try {
        targetGroup = await resolveTargetGroup(client, config.groupName);
    } catch (e) {
        if (e.message?.includes("detached Frame")) {
            console.error("[HEADER WATCHER] Frame desconectado durante resolução do grupo. Aguardando reconexão...");
            return;
        }
        throw e;
    }

    if (!targetGroup) {
        console.error(`[HEADER WATCHER] Grupo "${config.groupName}" não encontrado.`);
        return;
    }

    const headers = parseMarkdown(config.file);
    const state = loadState();
    let sentCount = 0;

    for (const { title, body } of headers) {
        if (body === state[title]) continue;
        const titleParts = title.split(/\s+/);
        const whatsappTitle = titleParts.length > 1
            ? `${titleParts[0]} *${titleParts.slice(1).join(" ")}*`
            : `*${title}*`;
        const formattedBody = mdToWhatsApp(body.replace(/"/g, "").trim());
        const message = `${whatsappTitle}\n\n${formattedBody}`;
        try {
            await targetGroup.sendMessage(message);
            console.log(`[HEADER WATCHER] Enviado: ${title}`);
            state[title] = body;
            sentCount++;
        } catch (e) {
            if (e.message?.includes("detached Frame")) {
                console.error("[HEADER WATCHER] Frame desconectado. Interrompendo sync e aguardando reconexão...");
                break;
            }
            console.error(`[HEADER WATCHER] Erro ao enviar "${title}":`, e.message);
        }
    }

    if (sentCount > 0) saveState(state);
    if (sentCount > 0) console.log(`[HEADER WATCHER] ${sentCount} seção(ões) atualizada(s) em "${config.groupName}".`);
}

let watcher = null;
let debounceTimer = null;
let clientRef = null;

function startWatching(client) {
    clientRef = client;
    const config = getWatcherConfig();
    if (!config) {
        console.warn("⚠️ Perfil secretário_franklin não configurado. Watcher não iniciado.");
        return;
    }

    const runInitialSync = () => {
        if (!isClientReady(clientRef)) {
            console.log("[HEADER WATCHER] Aguardando cliente ficar pronto...");
            setTimeout(runInitialSync, 2000);
            return;
        }
        syncFranklinHeaders(clientRef).catch(e => {
            console.error("[HEADER WATCHER] Erro no sync inicial:", e.message);
        });
    };

    runInitialSync();

    if (watcher) watcher.close();

    watcher = fs.watch(config.file, { persistent: true }, (eventType) => {
        if (eventType !== "change") return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                if (!isClientReady(clientRef)) {
                    console.warn("[HEADER WATCHER] Cliente não está pronto. Ignorando mudança de arquivo.");
                    return;
                }
                await syncFranklinHeaders(clientRef);
            } catch (e) {
                console.error("[HEADER WATCHER] Erro durante sync:", e.message);
            }
        }, 1000);
    });

    console.log(`[HEADER WATCHER] Monitorando: ${config.file}`);
}

function stopWatching() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    clearTimeout(debounceTimer);
}

module.exports = {
    startWatching,
    stopWatching,
    syncFranklinHeaders,
};
