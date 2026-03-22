const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");

const { upsertRootKey, time, vault } = obsidian;
const { toIsoMinuteZ, getLogicalDate } = time;
const { VAULT, DAILY_FOLDER } = vault;

function ensureArray(v) {
    if (!Array.isArray(v)) v = [null, null, null];
    while (v.length < 3) v.push(null); // Garante 3 slots iniciais
    return v;
}

async function setAlimentacao(cmd, tsSeconds, force) {
    const iso = toIsoMinuteZ(tsSeconds);
    const dateStr = getLogicalDate(tsSeconds);

    // Normaliza comando para identificar índice
    // café -> 0, almoço -> 1, janta -> 2, lanche -> push
    const c = cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    let index = -1;
    if (c === "cafe") index = 0;
    if (c === "almoco") index = 1;
    if (c === "janta") index = 2;

    return await upsertRootKey({
        vaultPath: VAULT,
        dailyFolder: DAILY_FOLDER,
        dateStr,
        key: "alimentacao",
        mutator: (cur) => {
            const arr = ensureArray(cur);

            if (index >= 0) {
                // Slot fixo (Café, Almoço, Janta)

                // Proteção: não sobrescreve se já existe (exceto se force=true)
                if (arr[index] && !force) return arr;

                // Idempotência
                if (arr[index] === iso) return arr;

                arr[index] = iso;
            } else {
                // Lanche (adiciona no final)

                // Idempotência simples (evita duplicar exatamente o mesmo timestamp)
                if (arr.includes(iso)) return arr;

                arr.push(iso);
            }
            return arr;
        },
    });
}

module.exports = {
    match({ parsed }) {
        if (!parsed) return false;
        const c = parsed.cmd.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ["cafe", "almoco", "janta", "lanche"].includes(c);
    },
    async handle({ msg, parsed }) {
        const force = hasForceFlag(parsed.args);
        return await setAlimentacao(parsed.cmd, msg.timestamp, force);
    },
};
