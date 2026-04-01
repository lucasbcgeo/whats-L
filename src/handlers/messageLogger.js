const fs = require("fs-extra");
const path = require("path");
const { data } = require("../config");

function getMarkdownFile(profile) {
    const profileConfig = data.profiles?.[profile];
    if (!profileConfig) return null;
    
    const allowedDests = profileConfig.allowedDestinations || [];
    const mdDest = allowedDests.find(d => {
        const destConfig = data.destinations?.[d];
        return destConfig?.localPath && destConfig.localPath.endsWith('.md');
    });
    
    if (mdDest) {
        return data.destinations[mdDest].localPath;
    }
    
    return null;
}

function formatTimestamp(tsSeconds) {
    const d = new Date(tsSeconds * 1000);
    const date = d.toLocaleDateString("pt-BR");
    const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return { date, time };
}

function getContactName(msg) {
    return msg._data?.notifyName || msg._data?.pushName || msg.from.split("@")[0];
}

async function appendToMarkdown(line, markdownFile) {
    await fs.ensureDir(path.dirname(markdownFile));
    const exists = await fs.pathExists(markdownFile);
    if (!exists) {
        await fs.writeFile(markdownFile, "# PRÉ Resumo WhatsApp\n\n", "utf8");
    }
    await fs.appendFile(markdownFile, line + "\n", "utf8");
}

module.exports = {
    match({ msg, profile }) {
        if (!profile) return false;
        if (msg.hasMedia) return false;
        const body = (msg.body || "").trim();
        if (!body) return false;
        
        const markdownFile = getMarkdownFile(profile);
        if (!markdownFile) return false;
        
        return true;
    },

    async handle({ msg, chat, profile }) {
        const markdownFile = getMarkdownFile(profile);
        if (!markdownFile) return;

        const { date, time } = formatTimestamp(msg.timestamp);
        const contactName = getContactName(msg);
        const body = msg.body.trim();

        let source;
        if (chat.isGroup) {
            source = chat.name;
        } else {
            source = contactName || msg.from.split("@")[0];
        }

        const line = `- **${date} ${time}** | *${source}*: ${body}`;

        await appendToMarkdown(line, markdownFile);
        console.log(`[MSG LOGGER] Logado: ${source} | ${body.substring(0, 50)}...`);
    },
};
