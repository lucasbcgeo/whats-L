const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");
const { getHandlerForTrigger } = require("../config/commands");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "exercise";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const isNo = parsed.args.some(a => ["não", "nao", "no", "false"].includes(a.toLowerCase()));
        const value = !isNo;
        return await metricService.saveMetric({ metric: "exercise", value, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
