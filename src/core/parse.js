function parseCommand(text) {
    const raw = (text || "").trim();
    if (!raw.startsWith("#")) return null;

    const parts = raw.split(/\s+/);
    const cmd = parts[0].slice(1).toLowerCase();
    const args = parts.slice(1);
    return { raw, cmd, args };
}

function hasForceFlag(args) {
    if (!Array.isArray(args)) return false;
    return args.some(a => ["correção", "correcao", "force"].includes(a.toLowerCase()));
}

module.exports = { parseCommand, hasForceFlag };
