const fs = require("fs-extra");
const path = require("path");
const { getForwarderSources } = require("../config");

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
    console.log(`[DEBUG FILE FORWARDER] getSourceInfo checking from: ${from}`);
    console.log(`[DEBUG FILE FORWARDER] SOURCE_CONFIG keys: ${Object.keys(SOURCE_CONFIG).join(', ')}`);
    if (SOURCE_CONFIG[from]) return SOURCE_CONFIG[from];
    for (const [num, config] of Object.entries(SOURCE_CONFIG)) {
        const fromNum = from.split('@')[0];
        const configNum = num.split('@')[0];
        console.log(`[DEBUG FILE FORWARDER] comparing: "${fromNum}" vs "${configNum}"`);
        if (from.includes(num.split('@')[0]) || num.split('@')[0].includes(from.split('@')[0])) {
            return config;
        }
    }
    return null;
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
        console.log(`[DEBUG FILE FORWARDER] match called with from: ${from}, hasMedia: ${msg.hasMedia}`);
        const config = getSourceInfo(from);
        if (!config) {
            console.log(`[DEBUG FILE FORWARDER] no config found for ${from}`);
            return false;
        }
        console.log(`[DEBUG FILE FORWARDER] config found: ${config.label}`);
        if (msg._data && (msg._data.type === 'interactive' || msg._data.type === 'list')) return false;
        if (!msg.hasMedia) {
            console.log(`[DEBUG FILE FORWARDER] no media, skipping`);
            return false;
        }

        const state = loadState();
        const matchedKey = Object.keys(SOURCE_CONFIG).find(key => 
            from.includes(key.split('@')[0]) || key.split('@')[0].includes(from.split('@')[0])
        );
        const entry = state[matchedKey];
        if (entry && entry.lastForwardTs && msg.timestamp <= entry.lastForwardTs) {
            console.log(`[DEBUG FILE FORWARDER] message too old, skipping`);
            return false;
        }

        return true;
    },

    async handle({ msg }) {
        const from = msg.from;
        const config = getSourceInfo(from);
        const client = msg.client;
        const dateStr = new Date(msg.timestamp * 1000).toLocaleString();

        console.log(`\n[FILE FORWARDER] ${config.label} | ${from} | ${dateStr}`);

        const matchedKey = Object.keys(SOURCE_CONFIG).find(key => 
            from.includes(key.split('@')[0]) || key.split('@')[0].includes(from.split('@')[0])
        );

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
            state[matchedKey] = {
                label: config.label,
                lastForwardTs: msg.timestamp,
                lastForwardDate: new Date(msg.timestamp * 1000).toISOString(),
            };
            saveState(state);

            console.log(`[FILE FORWARDER] Sucesso: Arquivo de ${config.label} incrementado.`);

            checkOverdue(matchedKey, config, state);
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
