const { metricService } = require("../services/metricService");
const { hasForceFlag, parseFlags } = require("../utils/parse");
const { resolveDateFlag } = require("../utils/dateParser");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "food";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const { flags } = parseFlags(parsed.args);
        const dateOverride = flags.data ? resolveDateFlag(flags.data, msg.timestamp) : null;
        return await metricService.saveMetric({ metric: "food", timestamp: msg.timestamp, rawArgs: parsed, options: { force, dateOverride } });
    },
};
