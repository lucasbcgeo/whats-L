const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { parseCommand } = require("../src/utils/parse");
const description = require("../src/handlers/description");

function tempVault() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desc-vault-"));
    process.env.OBSIDIAN_VAULT_PATH = dir;
    process.env.DAILY_FOLDER = "Diario";
    return dir;
}

test("#description grava description com aspas duplas na nota diária", async () => {
    const vault = tempVault();
    const parsed = parseCommand('#description "hoje foi bom"');

    const result = await description.handle({
        msg: { timestamp: Date.parse("2026-06-28T15:00:00-03:00") / 1000 },
        parsed,
    });

    const filePath = path.join(vault, "Diario", "2026", "06", "2026-06-28.md");
    assert.equal(result.filePath, filePath);
    assert.match(fs.readFileSync(filePath, "utf8"), /^---\ndescription: "hoje foi bom"\n---\n/);

    fs.rmSync(vault, { recursive: true, force: true });
});

test("#description aceita flag --data com linguagem natural", async () => {
    const vault = tempVault();
    const parsed = parseCommand('#description --data:27 de junho de 2026 "dia anterior"');

    await description.handle({
        msg: { timestamp: Date.parse("2026-06-28T15:00:00-03:00") / 1000 },
        parsed,
    });

    const filePath = path.join(vault, "Diario", "2026", "06", "2026-06-27.md");
    assert.equal(fs.existsSync(filePath), true);
    assert.match(fs.readFileSync(filePath, "utf8"), /description: "dia anterior"/);

    fs.rmSync(vault, { recursive: true, force: true });
});
