const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ["cafe", "almoco", "janta", "lanche"].includes(c);
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        return await metricService.saveMetric({ metric: "alimentacao", timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
