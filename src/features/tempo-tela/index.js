const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");
const { parseDurationToISO } = require("../../core/duration");

const { upsertRootKey, time, vault } = obsidian;
const { getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

async function setTempoTela(tsSeconds, durationRaw, force) {
    const dateStr = getLogicalDate(tsSeconds);
    const isoDuration = parseDurationToISO(durationRaw);

    if (!isoDuration) return null;

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "tempo_tela",
        mutator: (cur) => {
            if (cur && !force) return cur;
            return isoDuration;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        // aceita #tempo, #tempotela, #tela
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ["tempo", "tempotela", "tela"].includes(c);
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        // remove "tela" ou "de tela" se estiver logo no começo?
        // Vamos simplificar: assume que args são a duração.
        // ex: #tempo 1h
        // filter remove "force" e "correção".
        let argsClean = parsed.args.filter(a => !["correção", "correcao", "force"].includes(a.toLowerCase()));

        // Opcional: remover "de", "tela" se alguém digitar "#tempo de tela 1h" (cmd: tempo, args: [de, tela, 1h])
        if (argsClean[0] && ["de", "da"].includes(argsClean[0].toLowerCase())) {
            argsClean.shift();
        }
        if (argsClean[0] && ["tela"].includes(argsClean[0].toLowerCase())) {
            argsClean.shift();
        }

        const durationText = argsClean.join(" ");

        return await setTempoTela(msg.timestamp, durationText, force);
    },
};
