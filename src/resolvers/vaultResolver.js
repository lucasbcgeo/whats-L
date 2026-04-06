const { searchFiles } = require("../services/searchService");

async function resolve(term, sourceFilter, options = {}) {
    return searchFiles(term, sourceFilter, options);
}

module.exports = { resolve };
