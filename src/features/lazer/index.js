const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");

const { upsertRootKey, time, vault } = obsidian;
const { getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

async function setLazer(tsSeconds, value, force) {
    const dateStr = getLogicalDate(tsSeconds);

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "lazer",
        mutator: (cur) => {
            // Se já existe valor (true/false) e não é forçado, mantém
            if (cur !== undefined && cur !== null && !force) return cur;
            return value;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "lazer";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);

        // Verifica se é "não"
        const isNo = parsed.args.some(a => ["não", "nao", "no", "false"].includes(a.toLowerCase()));

        // Valor final (default é true/sim)
        const value = !isNo;

        return await setLazer(msg.timestamp, value, force);
    },
};
