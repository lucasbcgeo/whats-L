const fs = require("fs-extra");
const path = require("path");
const { data } = require("../config");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "file_to_folder_state.json");

function getSourceNumbers() {
    const numbers = [];
    const contacts = data.labels?.contacts || {};
    
    for (const profile of Object.values(data.profiles || {})) {
        const matchContacts = profile.match?.contacts || [];
        if (matchContacts.length === 0) continue;
        
        const allowedDests = profile.allowedDestinations || [];
        const localDest = allowedDests.find(d => data.destinations?.[d]?.localPath);
        if (!localDest) continue;
        
        const destConfig = data.destinations[localDest];
        const localPath = destConfig?.localPath;
        if (!localPath) continue;
        
        for (const contactKey of matchContacts) {
            const contactConfig = contacts[contactKey];
            if (!contactConfig) continue;
            
            if (contactConfig.numbers) {
                for (const num of contactConfig.numbers) {
                    numbers.push({ number: num, localPath, label: contactConfig.label });
                }
            }
            
            if (contactConfig.sublabels) {
                for (const subConfig of Object.values(contactConfig.sublabels)) {
                    if (subConfig.numbers) {
                        for (const num of subConfig.numbers) {
                            numbers.push({ number: num, localPath, label: subConfig.label || contactConfig.label });
                        }
                    }
                }
            }
        }
    }
    return numbers;
}

function getMessageAuthor(msg) {
    if (msg.author) return msg.author;
    if (msg._data?.participant) return msg._data.participant;
    return msg.from;
}

function matchSource(from) {
    const sourceList = getSourceNumbers();
    const fromNum = from.split("@")[0];
    
    for (const src of sourceList) {
        const srcNum = src.number.split("@")[0];
        if (fromNum.includes(srcNum) || srcNum.includes(fromNum)) {
            return src;
        }
    }
    return null;
}

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

function buildFilename(msg) {
    const d = new Date(msg.timestamp * 1000);
    const dateStr = d.toLocaleDateString('sv-SE'); // YYYY-MM-DD em horário local
    const ext = getExtension(msg);

    // Usa nome original do arquivo se disponível (documentos)
    const originalName = msg._data?.filename || msg._data?.caption;
    if (originalName) {
        const baseName = originalName.replace(/\.[^.]+$/, ''); // remove extensão original
        return `${dateStr}-${baseName}${ext}`;
    }

    // Fallback para mídias sem nome (imagens, vídeos, etc)
    const sender = (msg._data?.notifyName || msg.from.split("@")[0]).replace(/[^a-zA-Z0-9]/g, "_");
    return `${dateStr}-${sender}${ext}`;
}

function getExtension(msg) {
    const mime = msg._data?.mimetype || "";
    if (mime.includes("pdf")) return ".pdf";
    if (mime.includes("png")) return ".png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
    if (mime.includes("gif")) return ".gif";
    if (mime.includes("webp")) return ".webp";
    if (mime.includes("ogg")) return ".ogg";
    if (mime.includes("mp4")) return ".mp4";
    if (mime.includes("docx")) return ".docx";
    if (mime.includes("xlsx")) return ".xlsx";
    if (mime.includes("zip")) return ".zip";
    return ".bin";
}

module.exports = {
    match({ msg, chat }) {
        if (msg._data && (msg._data.type === "interactive" || msg._data.type === "list")) return false;
        if (!msg.hasMedia) {
            console.log(`[DEBUG LOCAL] no media, skipping`);
            return false;
        }

        if (chat?.isGroup) {
            console.log(`[DEBUG LOCAL] group message, accepting media from: ${chat.name}`);
            return true;
        }

        const author = getMessageAuthor(msg);
        console.log(`[DEBUG LOCAL] match called, author: ${author}, hasMedia: ${msg.hasMedia}, type: ${msg._data?.type}`);
        const src = matchSource(author);
        if (!src) {
            console.log(`[DEBUG LOCAL] no source match for ${author}`);
            return false;
        }
        console.log(`[DEBUG LOCAL] source matched: ${src.number} → ${src.localPath}`);

        const state = loadState();
        const fromNum = author.split("@")[0];
        
        const matchedKey = getSourceNumbers().find(s => {
            const srcNum = s.number.split("@")[0];
            return fromNum.includes(srcNum) || srcNum.includes(fromNum);
        })?.number;

        if (matchedKey && state[matchedKey] && msg.timestamp <= state[matchedKey]) {
            console.log(`[DEBUG LOCAL] message too old, skipping`);
            return false;
        }

        return true;
    },

    async handle({ msg, chat, profile }) {
        const author = getMessageAuthor(msg);
        const dateStr = new Date(msg.timestamp * 1000).toLocaleString();

        let localPath;
        let label;

        if (chat?.isGroup) {
            label = chat.name;
            const profileConfig = data.profiles?.[profile];
            if (profileConfig) {
                const allowedDests = profileConfig.allowedDestinations || [];
                for (const destKey of allowedDests) {
                    const destConfig = data.destinations?.[destKey];
                    if (destConfig?.localPath) {
                        localPath = destConfig.localPath;
                        break;
                    }
                }
            }
            if (!localPath) {
                console.error(`[FILE TO LOCAL] Grupo ${chat.name} sem localPath configurado.`);
                return;
            }
        } else {
            const src = matchSource(author);
            if (!src) return;
            localPath = src.localPath;
            label = src.label || author;
        }

        console.log(`\n[FILE TO LOCAL] ${label} | ${author} | ${dateStr}`);

        try {
            const media = await msg.downloadMedia();
            if (!media) {
                console.error("[FILE TO LOCAL] Mídia não disponível ou expirada.");
                return;
            }

            await fs.ensureDir(localPath);
            const filename = buildFilename(msg);
            const filePath = path.join(localPath, filename);

            const buffer = Buffer.from(media.data, "base64");
            await fs.writeFile(filePath, buffer);

            if (!chat?.isGroup) {
                const state = loadState();
                state[author] = msg.timestamp;
                saveState(state);
            }

            console.log(`[FILE TO LOCAL] Salvo: ${filename} → ${localPath}`);
        } catch (e) {
            console.error(`[FILE TO LOCAL] Erro: ${e.message}`);
        }
    },
};
