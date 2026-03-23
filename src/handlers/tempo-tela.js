const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ["tempo", "tempotela", "tela"].includes(c);
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        return await metricService.saveMetric({ metric: "tempo_tela", timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
