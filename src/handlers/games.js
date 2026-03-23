const { metricService } = require("../services/metricService");
const { hasForceFlag } = require("../utils/parse");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return parsed.cmd === "games";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const argsClean = parsed.args.filter(a => !["correção", "correcao", "force"].includes(a.toLowerCase()));
        const durationText = argsClean.join(" ");
        return await metricService.saveMetric({ metric: "games", value: durationText, timestamp: msg.timestamp, rawArgs: parsed, options: { force } });
    },
};
