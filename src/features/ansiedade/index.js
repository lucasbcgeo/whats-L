const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");

const { upsertRootKey, time, vault } = obsidian;
const { getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

async function setAnsiedade(tsSeconds, value, force) {
    const dateStr = getLogicalDate(tsSeconds);

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "ansiedade",
        mutator: (cur) => {
            // Se já existe e não é forçado, mantém
            if (cur !== undefined && cur !== null && !force) return cur;
            return value;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return c === "ansiedade";
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);

        // Tenta achar um número de 0 a 10 nos argumentos
        let value = null;
        for (const arg of parsed.args) {
            const n = parseFloat(arg.replace(",", "."));
            if (!isNaN(n) && n >= 0 && n <= 10) {
                value = n;
                break;
            }
        }

        if (value === null) {
            console.log("[ANSIEDADE] Valor inválido (0-10). Recebido:", parsed.args);
            return;
        }

        return await setAnsiedade(msg.timestamp, value, force);
    },
};
