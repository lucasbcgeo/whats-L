const fs = require("fs-extra");
const path = require("path");

const ALIASES_FILE = path.join(__dirname, "..", "..", "data", "aliases.json");

let _cache = null;
let _mtime = 0;

function loadAliases() {
    try {
        const stat = fs.statSync(ALIASES_FILE, { throwIfNoEntry: false });
        if (_cache && stat && stat.mtimeMs === _mtime) return _cache;
        if (!stat) return { sources: {}, destinations: {} };
        _cache = JSON.parse(fs.readFileSync(ALIASES_FILE, "utf8"));
        _mtime = stat.mtimeMs;
        return _cache;
    } catch {
        return { sources: {}, destinations: {} };
    }
}

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function resolveAlias(aliases, input) {
    const key = normalize(input);

    // Exact match first
    if (aliases[key]) return aliases[key];

    // Partial match — require alias >= 3 chars to avoid false positives
    for (const [alias, config] of Object.entries(aliases)) {
        const normAlias = normalize(alias);
        if (normAlias.length < 3) continue;
        if (key.includes(normAlias) || normAlias.includes(key)) {
            return config;
        }
    }

    return null;
}

function resolveSourceAlias(input) {
    if (!input) return null;
    const aliases = loadAliases();
    return resolveAlias(aliases.sources, input);
}

function resolveDestinationAlias(input) {
    if (!input) return null;
    const aliases = loadAliases();
    return resolveAlias(aliases.destinations, input);
}

module.exports = { resolveSourceAlias, resolveDestinationAlias, loadAliases };
