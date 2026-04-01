const { getHandlerForTrigger } = require("../config");
const { parseFlags } = require("../utils/parse");
const { resolveDateFlag } = require("../utils/dateParser");
const { undoMetric, getLastUndoContext, getLastEntryByMetric, getEntryByDateAndMetric, getAvailableMetrics } = require("../services/undoService");

const METRIC_ALIASES = {
    "cafe": "alimentacao", "almoco": "alimentacao", "janta": "alimentacao", "lanche": "alimentacao",
    "alimentacao": "alimentacao", "comida": "alimentacao", "refeicao": "alimentacao", "refeição": "alimentacao",
    "sono": "sono", "dormi": "sono", "acordei": "sono",
    "exercicio": "exercicio", "exercício": "exercicio", "treino": "exercicio", "academia": "exercicio",
    "games": "games", "jogos": "games", "game": "games", "jogo": "games",
    "tempo": "tempo_tela", "tela": "tempo_tela", "celular": "tempo_tela",
    "procrastinacao": "procrastinacao", "procrastinação": "procrastinacao", "procrastinei": "procrastinacao",
    "lazer": "lazer", "diversao": "lazer", "diversão": "lazer",
    "ansiedade": "ansiedade", "ansioso": "ansiedade", "nervoso": "ansiedade",
    "leitura": "leitura", "li": "leitura", "livro": "leitura",
    "tarefa": "tarefa", "afazer": "tarefa", "todo": "tarefa",
};

function normalize(text) {
    return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "undo";
    },
    async handle({ msg, parsed }) {
        const { flags, remaining } = parseFlags(parsed.args || []);

        // #desfazer listar → mostra métricas disponíveis
        if (remaining.length > 0 && normalize(remaining[0]) === "listar") {
            const metrics = getAvailableMetrics();
            if (metrics.length === 0) {
                await msg.reply("Nenhuma métrica registrada ainda.");
            } else {
                await msg.reply(`Métricas disponíveis para desfazer:\n• ${metrics.join("\n• ")}`);
            }
            return;
        }

        let ctx = null;
        let description = "";

        // Resolve métrica do arg (ex: "cafe" → "alimentacao")
        let targetMetric = null;
        if (remaining.length > 0) {
            const alias = normalize(remaining[0]);
            targetMetric = METRIC_ALIASES[alias] || remaining[0];
        }

        // Resolve flag de data
        let targetDate = null;
        if (flags.data) {
            targetDate = resolveDateFlag(flags.data, msg.timestamp);
        }

        // Busca contexto
        if (targetMetric && targetDate) {
            ctx = getEntryByDateAndMetric(targetMetric, targetDate);
            description = `*${targetMetric}* de ${targetDate}`;
        } else if (targetMetric) {
            ctx = getLastEntryByMetric(targetMetric);
            description = `*${targetMetric}*`;
        } else if (targetDate) {
            // Busca qualquer métrica daquela data
            const { time } = require("../services/obsidianService");
            const allCtx = getLastUndoContext();
            if (allCtx) {
                const allDate = time.getLogicalDate(allCtx.timestamp, -3);
                if (allDate === targetDate) {
                    ctx = allCtx;
                    description = `entrada de ${targetDate}`;
                }
            }
            if (!ctx) {
                await msg.reply(`Nenhuma entrada encontrada para ${targetDate}.`);
                return;
            }
        } else {
            ctx = getLastUndoContext();
            description = ctx ? `*${ctx.metric}*` : "";
        }

        if (!ctx) {
            const available = getAvailableMetrics();
            if (available.length > 0) {
                await msg.reply(`Nada encontrado para desfazer. Métricas disponíveis: ${available.join(", ")}`);
            } else {
                await msg.reply("Nada para desfazer.");
            }
            return;
        }

        const success = await undoMetric(ctx.msgId);
        if (success) {
            await msg.reply(`Desfeito: ${description} revertido.`);
        } else {
            await msg.reply("Não foi possível desfazer.");
        }
    },
};
