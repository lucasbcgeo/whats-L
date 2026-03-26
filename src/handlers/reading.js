const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "reading";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const isNo = parsed.args.some(a => ["não", "nao", "no", "false"].includes(a.toLowerCase()));
        const value = !isNo;
        return await metricService.saveMetric({ metric: "reading", value, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
