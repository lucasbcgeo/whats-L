const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "leitura";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const isNo = parsed.args.some(a => ["não", "nao", "no", "false"].includes(a.toLowerCase()));
        const value = !isNo;
        return await metricService.saveMetric({ metric: "leitura", value, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
