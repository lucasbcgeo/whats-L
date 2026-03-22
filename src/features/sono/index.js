const obsidian = require("../../services/obsidian");
const { hasForceFlag } = require("../../core/parse");

const { upsertRootKey, time, vault } = obsidian;
const { toIsoMinuteZ, dateFromTsUTC, shiftDateStrUTC, getSonoDormiDate, getLocalCalendarDate, msToISODuration } = time;
const { VAULT, DAILY_FOLDER, CUT_OFF } = vault;

function ensureSonoArray(v) {
  if (!Array.isArray(v)) v = [null, null, null];
  while (v.length < 3) v.push(null);
  return v.slice(0, 3);
}

async function setDormi(tsSeconds, force = false) {
  const dormiuISO = toIsoMinuteZ(tsSeconds);
  const dateStr = getSonoDormiDate(tsSeconds, CUT_OFF); // madrugada aplicada aqui

  return await upsertRootKey({
    vaultPath: VAULT,
    dailyFolder: DAILY_FOLDER,
    dateStr,
    key: "sono",
    mutator: (cur) => {
      const sono = ensureSonoArray(cur);

      // Se já existe valor e NÃO é forçado, mantém o atual (segurança)
      if (sono[1] && !force) return sono;

      // idempotência (mesmo se forçado, se for igual não precisa gastar write)
      if (sono[1] === dormiuISO) return sono;

      sono[1] = dormiuISO;
      // duração calcula amanhã no acordei
      if (sono[2] === undefined) sono[2] = null;
      return sono;
    },
  });
}

async function setAcordei(tsSeconds, force = false) {
  const acordouISO = toIsoMinuteZ(tsSeconds);
  const today = getLocalCalendarDate(tsSeconds);

  // 1) grava acordei na nota do dia real
  await upsertRootKey({
    vaultPath: VAULT,
    dailyFolder: DAILY_FOLDER,
    dateStr: today,
    key: "sono",
    mutator: (cur) => {
      const sono = ensureSonoArray(cur);

      // Proteção contra sobrescrita acidental
      if (sono[0] && !force) return sono;

      if (sono[0] === acordouISO) return sono; // idempotência
      sono[0] = acordouISO;
      return sono;
    },
  });

  // 2) calcula duração e grava NA NOTA DO DORMIU (normalmente ontem)
  const prevDate = shiftDateStrUTC(today, -1);

  return await upsertRootKey({
    vaultPath: VAULT,
    dailyFolder: DAILY_FOLDER,
    dateStr: prevDate,
    key: "sono",
    mutator: (cur) => {
      const sono = ensureSonoArray(cur);
      const dormiuISO = sono[1];
      if (!dormiuISO) return sono;

      const dormiuMs = Date.parse(dormiuISO.replace("Z", ":00Z"));
      const acordouMs = Date.parse(acordouISO.replace("Z", ":00Z"));
      if (Number.isNaN(dormiuMs) || Number.isNaN(acordouMs) || acordouMs <= dormiuMs) return sono;

      const durationISO = msToISODuration(acordouMs - dormiuMs);
      if (sono[2] === durationISO) return sono; // idempotência
      sono[2] = durationISO;
      return sono;
    },
  });
}

module.exports = {
  match({ parsed }) {
    if (!parsed) return false;
    const { cmd } = parsed;
    return cmd === "acordei" || cmd === "dormi";
  },
  async handle({ msg, parsed }) {
    // Verifica se "correção" (ou sem acento) está nos argumentos
    const force = hasForceFlag(parsed.args);

    if (parsed.cmd === "dormi") return await setDormi(msg.timestamp, force);
    return await setAcordei(msg.timestamp, force);
  },
};
