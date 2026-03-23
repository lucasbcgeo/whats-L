const fs = require("fs-extra");
const path = require("path");

const ALIASES_FILE = path.join(__dirname, "..", "..", "data", "aliases.json");

function loadAliases() {
    try {
        if (!fs.existsSync(ALIASES_FILE)) return { sources: {}, destinations: {} };
        return JSON.parse(fs.readFileSync(ALIASES_FILE, "utf8"));
    } catch {
        return { sources: {}, destinations: {} };
    }
}

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function resolveSourceAlias(input) {
    if (!input) return null;
    const key = normalize(input);
    const aliases = loadAliases();

    // Check custom aliases first (exact match)
    if (aliases.sources[key]) return aliases.sources[key];

    // Check partial match (key contains alias or alias contains key)
    for (const [alias, config] of Object.entries(aliases.sources)) {
        if (key.includes(normalize(alias)) || normalize(alias).includes(key)) {
            return config;
        }
    }

    return null;
}

function resolveDestinationAlias(input) {
    if (!input) return null;
    const key = normalize(input);
    const aliases = loadAliases();

    if (aliases.destinations[key]) return aliases.destinations[key];

    for (const [alias, config] of Object.entries(aliases.destinations)) {
        if (key.includes(normalize(alias)) || normalize(alias).includes(key)) {
            return config;
        }
    }

    return null;
}

module.exports = { resolveSourceAlias, resolveDestinationAlias, loadAliases };
