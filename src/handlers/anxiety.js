const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "anxiety";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        let value = null;
        for (const arg of parsed.args) {
            const n = parseFloat(arg.replace(",", "."));
            if (!isNaN(n) && n >= 0 && n <= 10) { value = n; break; }
        }
        if (value === null) {
            console.log("[ANXIETY] Valor invalido (0-10). Recebido:", parsed.args);
            return;
        }
        return await metricService.saveMetric({ metric: "anxiety", value, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
