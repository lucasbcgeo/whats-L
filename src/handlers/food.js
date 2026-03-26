const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "food";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        return await metricService.saveMetric({ metric: "food", timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
