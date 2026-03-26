const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "sleep";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const metric = parsed.cmd === "dormi" ? "sleep_bed" : "sleep_wake";
        return await metricService.saveMetric({ metric, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
