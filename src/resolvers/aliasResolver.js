const { resolveSource, resolveDestination } = require("../config/commands");

function resolveSourceAlias(input) {
    if (!input) return null;
    const vault = resolveSource(input);
    if (vault) return { type: "vault", vault };
    return null;
}

function resolveDestinationAlias(input) {
    return resolveDestination(input);
}

module.exports = { resolveSourceAlias, resolveDestinationAlias };
