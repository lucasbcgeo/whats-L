const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");

const { upsertRootKey, time, vault } = obsidian;
const { getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

async function setExercicio(tsSeconds, value, force) {
    const dateStr = getLogicalDate(tsSeconds);

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "exercicio",
        mutator: (cur) => {
            // Se já existe valor definido (true/false) e não é forçado, mantém
            if (cur !== undefined && cur !== null && !force) return cur;

            return value;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "exercicio";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);

        // Verifica se é "não"
        const isNo = parsed.args.some(a => ["não", "nao", "no", "false"].includes(a.toLowerCase()));

        // Valor final (default é true/sim)
        const value = !isNo;

        return await setExercicio(msg.timestamp, value, force);
    },
};
