const assert = require("assert");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

async function main() {
  const vault = await fs.mkdtemp(path.join(os.tmpdir(), "whats-l-metric-"));
  process.env.OBSIDIAN_VAULT_PATH = vault;
  process.env.DAILY_FOLDER = "Jornada";

  const dateStr = "2026-06-21";
  const note = path.join(vault, "Jornada", "2026", "06", `${dateStr}.md`);
  await fs.ensureDir(path.dirname(note));
  await fs.writeFile(note, "---\nleitura: false\n---\n", "utf8");

  const { saveMetric } = require("../src/services/metricService");
  const result = await saveMetric({ metric: "reading", value: true, dateStr });

  assert.strictEqual(result.value, true);
  assert.match(await fs.readFile(note, "utf8"), /leitura: true/);
  await fs.remove(vault);
  console.log("boolean metric false -> true ok");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
