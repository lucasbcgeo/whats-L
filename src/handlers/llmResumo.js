const { getHandlerForTrigger } = require("../config");
const { processar } = require("../services/llmResumoService");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "llmResumo";
    },
    async handle({ msg }) {
        try {
            await msg.reply("Processando resumo...");
            const result = await processar();
            await msg.reply(result.success ? `${result.message}` : `${result.message}`);
        } catch (e) {
            console.error("[LLM RESUMO] Erro:", e.message);
            await msg.reply(`Erro ao atualizar resumo: ${e.message}`);
        }
    },
};
