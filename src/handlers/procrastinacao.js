const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "procrastinacao";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        let value = null;
        for (const arg of parsed.args) {
            const n = parseFloat(arg.replace(",", "."));
            if (!isNaN(n) && n >= 0 && n <= 10) { value = n; break; }
        }
        if (value === null) {
            console.log("[PROCRASTINACAO] Valor invalido (0-10). Recebido:", parsed.args);
            return;
        }
        return await metricService.saveMetric({ metric: "procrastinacao", value, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
