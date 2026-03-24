const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config/commands");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "screenTime";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        return await metricService.saveMetric({ metric: "screenTime", timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
