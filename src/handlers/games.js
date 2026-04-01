const { metricService } = require("../services/metricService");
const { hasForceFlag, parseFlags } = require("../utils/parse");
const { resolveDateFlag } = require("../utils/dateParser");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "games";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const { flags, remaining } = parseFlags(parsed.args);
        const dateOverride = flags.data ? resolveDateFlag(flags.data, msg.timestamp) : null;
        const argsClean = remaining.filter(a => {
            const norm = a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return !["correcao", "correção", "force"].includes(norm) && norm !== "force";
        });
        const durationText = argsClean.join(" ");
        return await metricService.saveMetric({ metric: "games", value: durationText, timestamp: msg.timestamp, rawArgs: parsed, options: { force, dateOverride } });
    },
};
