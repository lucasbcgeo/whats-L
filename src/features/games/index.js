const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");
const { parseDurationToISO } = require("../../core/duration");

const { upsertRootKey, time, vault } = obsidian;
const { getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

async function setGames(tsSeconds, durationRaw, force) {
    const dateStr = getLogicalDate(tsSeconds);
    const isoDuration = parseDurationToISO(durationRaw);

    if (!isoDuration) return null;

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "games",
        mutator: (cur) => {
            if (cur && !force) return cur;
            return isoDuration;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        return parsed.cmd === "games";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        const argsClean = parsed.args.filter(a => !["correção", "correcao", "force"].includes(a.toLowerCase()));
        const durationText = argsClean.join(" ");

        return await setGames(msg.timestamp, durationText, force);
    },
};
