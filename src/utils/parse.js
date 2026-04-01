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

function parseFlags(args) {
    const flags = {};
    const remaining = [];
    for (const a of args) {
        const m = a.match(/^--([^:]+):(.+)$/);
        if (m) {
            flags[m[1].toLowerCase()] = m[2];
        } else if (a.startsWith("--")) {
            flags[a.slice(2).toLowerCase()] = true;
        } else {
            remaining.push(a);
        }
    }
    return { flags, remaining };
}

module.exports = { parseCommand, hasForceFlag, parseFlags };
