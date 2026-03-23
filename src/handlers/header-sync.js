const fs = require("fs");
const path = require("path");
const { HEADER_SYNC_FILE, HEADER_SYNC_GROUP_ID } = require("../config/env");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "header_sync_state.json");

let _state = null;

function loadState() {
    if (_state !== null) return _state;
    try {
        if (!fs.existsSync(STATE_FILE)) return _state = {};
        _state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (_) { _state = {}; }
    return _state;
}

function saveState(state) {
    try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
        _state = state;
    } catch (e) { console.error("⚠️ Erro ao salvar estado do headerSync:", e.message); }
}

function stripComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function parseMarkdown(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`❌ Arquivo não encontrado: ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, "utf8");
    const parts = content.split(/^###\s+/m);
    const results = [];
    for (let i = 1; i < parts.length; i++) {
        const lines = parts[i].split("\n");
        const title = "### " + lines[0].trim();
        const bodyRaw = lines.slice(1).join("\n");
        let body = stripComments(bodyRaw).replace(/\n---\s*$/, "").trim();
        if (body) results.push({ title, body });
    }
    return results;
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "titulo";
    },
    async handle({ msg }) {
        if (!HEADER_SYNC_FILE || !HEADER_SYNC_GROUP_ID) {
            console.warn("⚠️ HEADER_SYNC_FILE ou HEADER_SYNC_GROUP_ID não configurados.");
            return;
        }
        const headers = parseMarkdown(HEADER_SYNC_FILE);
        const state = loadState();
        let sentCount = 0;
        for (const { title, body } of headers) {
            if (body === state[title]) continue;
            const cleanTitle = title.replace(/^###\s+/, "").replace(/"/g, "").trim();
            const titleParts = cleanTitle.split(/\s+/);
            const whatsappTitle = titleParts.length > 1
                ? `${titleParts[0]} *${titleParts.slice(1).join(" ")}*`
                : `*${cleanTitle}*`;
            const message = `${whatsappTitle}\n\n${body.replace(/"/g, "").trim()}`;
            try {
                await msg.client.sendMessage(HEADER_SYNC_GROUP_ID, message);
                console.log(`✅ Mensagem enviada para o header: ${title}`);
                state[title] = body;
                sentCount++;
            } catch (e) {
                console.error(`❌ Erro ao enviar mensagem para header "${title}":`, e.message);
            }
        }
        if (sentCount > 0) saveState(state);
        console.log(`✅ Sincronização finalizada. ${sentCount} mensagens enviadas.`);
    },
};
