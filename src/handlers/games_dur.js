const { metricService } = require("../services/metricService");
const { hasForceFlag, parseFlags } = require("../utils/parse");
const { resolveDateFlag } = require("../utils/dateParser");
const { getHandlerForTrigger } = require("../config");
const { parseDurationToISO } = require("../utils/duration");

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return getHandlerForTrigger(parsed.cmd) === "games_dur";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const { flags, remaining } = parseFlags(parsed.args);
        const dateOverride = flags.data ? resolveDateFlag(flags.data, msg.timestamp) : null;
        const dateRefColumn = flags.dataref === "sim";
        const argsClean = remaining.filter(a => {
            const norm = a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return !["correcao", "correção", "force"].includes(norm);
        });
        const durationText = argsClean.join(" ");

        const iso = parseDurationToISO(durationText);
        if (!iso) {
            console.log(`[GAMES_DUR] Duração inválida: "${durationText}"`);
            return;
        }

        return await metricService.saveMetric({
            metric: "games_dur",
            value: durationText,
            timestamp: msg.timestamp,
            rawArgs: parsed,
            options: { force, dateOverride, dateRefColumn },
        });
    },
};
