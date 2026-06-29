const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { parseCommand } = require("../src/utils/parse");
const annotation = require("../src/handlers/annotation");

function tempVault() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "annotation-vault-"));
    process.env.OBSIDIAN_VAULT_PATH = dir;
    return dir;
}

test("#anotação cria header nível 2 e conteúdo na nota Anotação do dia", async () => {
    const vault = tempVault();
    const parsed = parseCommand('#anotação Saúde "Tomei remédio depois do almoço"');

    const result = await annotation.handle({
        msg: { timestamp: Date.parse("2026-06-28T15:00:00-03:00") / 1000 },
        parsed,
    });

    const filePath = path.join(vault, "00_Passageiras", "2026-06-28-Anotação.md");
    assert.equal(result.filePath, filePath);
    assert.equal(fs.readFileSync(filePath, "utf8"), "## Saúde\nTomei remédio depois do almoço\n");

    fs.rmSync(vault, { recursive: true, force: true });
});
