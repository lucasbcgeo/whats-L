const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const { cmd } = parsed;
        return cmd === "acordei" || cmd === "dormi";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const metric = parsed.cmd === "dormi" ? "sono_dormi" : "sono_acordei";
        return await metricService.saveMetric({ metric, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
