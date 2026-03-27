function parseCommand(text) {
    const raw = (text || "").trim();
    if (!raw.startsWith("#")) return null;

    const parts = raw.split(/\s+/);
    const cmdRaw = parts[0].slice(1).toLowerCase();
    const cmd = cmdRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,!?;:]+$/, "");
    const args = parts.slice(1);
    return { raw, cmd, cmdRaw, args };
}

function hasForceFlag(args) {
    if (!Array.isArray(args)) return false;
    return args.some(a => ["correção", "correcao", "force"].includes(a.toLowerCase()));
}

module.exports = { parseCommand, hasForceFlag };
