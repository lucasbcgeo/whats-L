const SOURCES = (process.env.FORWARD_SOURCE_NUMBERS || "").split(",").map(s => s.trim());
const TARGET_NAME = process.env.TARGET_FORWARD_GROUP_NAME || "Banco - Fátima";

const MIN_DATES = {
    "556199099705@c.us": 1733356800, // 05-12-2025
    "5511999910621@c.us": 1740268800, // 23-02-2026
    "182364311425240@lid": 1740268800  // 23-02-2026
};

let cachedGroupId = null;

async function getTargetGroup(client) {
    if (cachedGroupId) {
        try {
            const chat = await client.getChatById(cachedGroupId);
            if (chat) return chat;
        } catch {
            cachedGroupId = null;
        }
    }
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === TARGET_NAME);
    if (group) {
        cachedGroupId = group.id._serialized;
    }
    return group;
}

module.exports = {
    match({ msg }) {
        const from = msg.from;
        if (!SOURCES.includes(from)) return false;

        // Ignora mensagens interativas (botões da Claro) que não são arquivos reais
        // Isso evita o erro "webMediaType is invalid: interactive"
        if (msg._data && (msg._data.type === 'interactive' || msg._data.type === 'list')) {
            return false;
        }

        const minTs = MIN_DATES[from] || 0;
        return msg.hasMedia && msg.timestamp >= minTs;
    },
    async handle({ msg }) {
        const client = msg.client || (await msg.getChat()).client;
        
        console.log(`\n[FILE FORWARDER] Baixando arquivo de: ${msg.from} (${new Date(msg.timestamp * 1000).toLocaleString()})`);

        try {
            const media = await msg.downloadMedia();
            if (!media) {
                console.error("[FILE FORWARDER] Mídia não disponível ou expirada.");
                return;
            }

            const targetGroup = await getTargetGroup(client);
            if (!targetGroup) {
                console.error(`[FILE FORWARDER] Grupo "${TARGET_NAME}" não encontrado.`);
                return;
            }

            await targetGroup.sendMessage(media, { caption: msg.body || "" });
            console.log(`[FILE FORWARDER] Sucesso: Arquivo encaminhado.`);
        } catch (e) {
            console.error(`[FILE FORWARDER] Erro ao processar mídia: ${e.message}`);
        }
    }
};
