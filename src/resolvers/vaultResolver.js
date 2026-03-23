const { searchFiles } = require("../services/searchService");

async function resolve(term, sourceFilter) {
    return searchFiles(term, sourceFilter);
}

module.exports = { resolve };
