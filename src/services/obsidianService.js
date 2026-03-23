const obsidianClient = require("../lib/obsidianClient");

async function upsertRootKey({ dateStr, key, mutator }) {
    return await obsidianClient.upsertRootKey({ dateStr, key, mutator });
}

module.exports = {
    upsertRootKey,
    time: obsidianClient.time,
};
