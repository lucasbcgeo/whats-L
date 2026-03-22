const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "..", "..", "..", "data", "header_sync_state.json");

function ensureDir(filePath) {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        const data = fs.readFileSync(STATE_FILE, "utf8");
        return JSON.parse(data);
    } catch (e) {
        console.error("⚠️ Erro ao carregar estado do headerSync:", e.message);
        return {};
    }
}

function saveState(state) {
    try {
        ensureDir(STATE_FILE);
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    } catch (e) {
        console.error("⚠️ Erro ao salvar estado do headerSync:", e.message);
    }
}

function stripComments(text) {
    return text.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function parseMarkdown(filePath) {
    if (!fs.existsSync(filePath)) {
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
        
        let body = stripComments(bodyRaw);
        body = body.replace(/\n---\s*$/, "").trim();

        if (body) {
            results.push({ title, body });
        }
    }

    return results;
}

async function syncHeaders(client) {
    const filePath = process.env.HEADER_SYNC_FILE;
    const groupId = process.env.HEADER_SYNC_GROUP_ID;

    if (!filePath || !groupId) {
        console.error("⚠️ HEADER_SYNC_FILE ou HEADER_SYNC_GROUP_ID não configurados no .env");
        return;
    }

    console.log(`\n🔄 Iniciando sincronização de headers: ${filePath}`);

    const state = loadState();
    const headers = parseMarkdown(filePath);
    let sentCount = 0;

    for (const { title, body } of headers) {
        const lastBody = state[title];

        if (body !== lastBody) {
            const cleanTitle = title.replace(/^###\s+/, "").replace(/"/g, "").trim();
            const titleParts = cleanTitle.split(/\s+/);
            let whatsappTitle = "";
            
            if (titleParts.length > 1) {
                whatsappTitle = `${titleParts[0]} *${titleParts.slice(1).join(" ")}*`;
            } else {
                whatsappTitle = `*${cleanTitle}*`;
            }

            const cleanBody = body.replace(/"/g, "").trim();

            const message = `${whatsappTitle}\n\n${cleanBody}`;
            try {
                await client.sendMessage(groupId, message);
                console.log(`✅ Mensagem enviada para o header: ${title}`);
                state[title] = body;
                sentCount++;
            } catch (e) {
                console.error(`❌ Erro ao enviar mensagem para header "${title}":`, e.message);
            }
        }
    }

    if (sentCount > 0) {
        saveState(state);
    }
    console.log(`✅ Sincronização finalizada. ${sentCount} mensagens enviadas.\n`);
}

module.exports = { syncHeaders };
