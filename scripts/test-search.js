const { searchFiles } = require("../src/services/searchService");
const results = searchFiles("documento_rg", null);
console.log(JSON.stringify(results, null, 2));
