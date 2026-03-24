const fs = require("fs-extra");
const path = require("path");
const { getForwarderSources } = require("../config/commands");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "forward_state.json");

const SOURCE_CONFIG = getForwarderSources();

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch { return {}; }
}

function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

let cachedGroupId = null;
let cachedGroupName = null;

async function getTargetGroup(client, targetGroupName) {
    if (cachedGroupId && cachedGroupName === targetGroupName) {
        try {
            const chat = await client.getChatById(cachedGroupId);
            if (chat) return chat;
        } catch { cachedGroupId = null; cachedGroupName = null; }
    }
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === targetGroupName);
    if (group) {
        cachedGroupId = group.id._serialized;
        cachedGroupName = targetGroupName;
    }
    return group;
}

function getSourceInfo(from) {
    return SOURCE_CONFIG[from] || null;
}

function checkOverdue(sourceNum, config, state) {
    const entry = state[sourceNum];
    if (!entry || !entry.lastForwardTs) return;
    const now = Math.floor(Date.now() / 1000);
    const daysSince = Math.floor((now - entry.lastForwardTs) / 86400);
    if (daysSince > config.frequencyDays) {
        console.log(`⚠️ [FILE FORWARDER] ${config.label} (${sourceNum}): ${daysSince} dias sem enviar (esperado: a cada ${config.frequencyDays} dias)`);
    }
}

module.exports = {
    match({ msg }) {
        const from = msg.from;
        const config = getSourceInfo(from);
        if (!config) return false;
        if (msg._data && (msg._data.type === 'interactive' || msg._data.type === 'list')) return false;
        if (!msg.hasMedia) return false;

        const state = loadState();
        const entry = state[from];
        if (entry && entry.lastForwardTs && msg.timestamp <= entry.lastForwardTs) return false;

        return true;
    },

    async handle({ msg }) {
        const from = msg.from;
        const config = getSourceInfo(from);
        const client = msg.client;
        const dateStr = new Date(msg.timestamp * 1000).toLocaleString();

        console.log(`\n[FILE FORWARDER] ${config.label} | ${from} | ${dateStr}`);

        try {
            const media = await msg.downloadMedia();
            if (!media) {
                console.error("[FILE FORWARDER] Mídia não disponível ou expirada.");
                return;
            }

            const targetGroupName = config.targetGroupName;
            const targetGroup = await getTargetGroup(client, targetGroupName);
            if (!targetGroup) {
                console.error(`[FILE FORWARDER] Grupo "${targetGroupName}" não encontrado.`);
                return;
            }

            await targetGroup.sendMessage(media, { caption: `[${config.label}] ${msg.body || ""}`.trim() });

            const state = loadState();
            state[from] = {
                label: config.label,
                lastForwardTs: msg.timestamp,
                lastForwardDate: new Date(msg.timestamp * 1000).toISOString(),
            };
            saveState(state);

            console.log(`[FILE FORWARDER] Sucesso: Arquivo de ${config.label} encaminhado.`);

            checkOverdue(from, config, state);
        } catch (e) {
            console.error(`[FILE FORWARDER] Erro: ${e.message}`);
        }
    },

    checkAllSources() {
        const state = loadState();
        for (const [num, config] of Object.entries(SOURCE_CONFIG)) {
            checkOverdue(num, config, state);
        }
    },
};
