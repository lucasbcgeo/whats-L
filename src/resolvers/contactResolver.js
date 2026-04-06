const fs = require("fs-extra");
const path = require("path");
const os = require("os");

const FETCH_LIMIT = 200;
const TEMP_DIR = path.join(os.tmpdir(), "whats-L-contact-resolver");

function fuzzyMatch(text, term) {
    const lower = (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const termLower = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = termLower.split(/\s+/);
    return words.every(w => lower.includes(w));
}

function getMediaFilename(msg) {
    if (msg._data && msg._data.filename) return msg._data.filename;
    if (msg.body && !msg.body.startsWith("+") && msg.body.includes(".")) return msg.body;
    const ext = (msg.mimetype || "").split("/").pop();
    return `media-${msg.id?._serialized || Date.now()}.${ext}`;
}

async function resolve(client, contactName, term, options = {}) {
    const results = [];
    try {
        const chats = await client.getChats();
        const contactChat = chats.find(c => {
            if (c.isGroup) return false;
            const cName = (c.name || "").toLowerCase();
            const cContact = c.contact;
            const pushname = cContact?.pushname?.toLowerCase() || "";
            const searchName = contactName.toLowerCase();
            return cName.includes(searchName) || pushname.includes(searchName);
        });

        if (!contactChat) {
            console.log(`[CONTACT RESOLVER] Chat com "${contactName}" não encontrado.`);
            return results;
        }

        const messages = await contactChat.fetchMessages({ limit: FETCH_LIMIT });

        for (const msg of messages) {
            if (!msg.hasMedia) continue;
            const filename = getMediaFilename(msg);
            if (!fuzzyMatch(filename, term)) continue;

            try {
                const media = await msg.downloadMedia();
                if (!media) continue;

                await fs.ensureDir(TEMP_DIR);
                const safeName = filename.replace(/[<>:"/\\|?*]/g, "_");
                const tempPath = path.join(TEMP_DIR, `${Date.now()}-${safeName}`);
                await fs.writeFile(tempPath, media.data, "base64");

                results.push({
                    name: filename,
                    path: tempPath,
                    source: contactChat.name || contactName,
                    _temp: true,
                    mimetype: media.mimetype,
                });
            } catch (e) {
                console.error(`[CONTACT RESOLVER] Erro ao baixar mídia: ${e.message}`);
            }
        }
    } catch (e) {
        console.error(`[CONTACT RESOLVER] Erro: ${e.message}`);
    }
    return results;
}

function cleanupTemp() {
    try {
        if (fs.existsSync(TEMP_DIR)) {
            fs.removeSync(TEMP_DIR);
        }
    } catch {}
}

module.exports = { resolve, cleanupTemp };
