const path = require("path");
const fs = require("fs-extra");
const yaml = require("js-yaml");
const { VAULT, DAILY_FOLDER, DORMIR_MADRUGADA_ATE } = require("../config/env");

const vaultPath = VAULT;
const dailyFolder = DAILY_FOLDER || "Diario";
const cutOff = DORMIR_MADRUGADA_ATE;

function splitFrontmatter(md) {
  const match = md.match(/^---[ \t]*[\r\n]+([\s\S]*?)---[ \t]*[\r\n]+/);
  if (!match) return { fmObj: {}, body: md };

  const fmRaw = match[1];
  const body = md.slice(match[0].length);

  let fmObj = {};
  try { fmObj = yaml.load(fmRaw, { schema: yaml.JSON_SCHEMA }) || {}; } catch { fmObj = {}; }
  return { fmObj, body };
}

function buildFrontmatter(fmObj) {
  const dumped = yaml.dump(fmObj, { schema: yaml.JSON_SCHEMA, lineWidth: 120, noRefs: true }).trimEnd();
  return `---\n${dumped}\n---\n`;
}

async function ensureDailyNote(dateStr) {
  const [yyyy, mm] = dateStr.split("-");
  const filePath = path.join(vaultPath, dailyFolder, yyyy, mm, `${dateStr}.md`);
  await fs.ensureDir(path.dirname(filePath));
  if (!(await fs.pathExists(filePath))) {
    await fs.writeFile(filePath, "---\n---\n", "utf8");
  }
  return filePath;
}

async function readDaily({ dateStr }) {
  const filePath = await ensureDailyNote(dateStr);
  const md = await fs.readFile(filePath, "utf8");
  const { fmObj, body } = splitFrontmatter(md);
  return { filePath, fmObj, body };
}

async function writeDaily({ filePath, fmObj, body }) {
  const out = buildFrontmatter(fmObj) + body.replace(/^\n+/, "\n");
  await fs.writeFile(filePath, out, "utf8");
}

async function upsertRootKey({ dateStr, key, mutator }) {
  const { filePath, fmObj, body } = await readDaily({ dateStr });
  const current = fmObj[key];
  const next = mutator(current, fmObj);
  fmObj[key] = next;
  await writeDaily({ filePath, fmObj, body });
  return { filePath, key, value: next };
}

function toIsoMinuteZ(tsSeconds) {
  const iso = new Date(tsSeconds * 1000).toISOString();
  return iso.slice(0, 16) + "Z";
}

function dateFromTsUTC(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function shiftDateStrUTC(dateStr, days) {
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function getLogicalDate(tsSeconds, offset = -3, cutoff = cutOff) {
  const d = new Date(tsSeconds * 1000);
  const localMs = d.getTime() + (offset * 3600 * 1000);
  const localDate = new Date(localMs);

  const hourLocal = localDate.getUTCHours();
  let dateStr = localDate.toISOString().slice(0, 10);

  if (hourLocal < cutoff) {
    const prev = new Date(`${dateStr}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    dateStr = prev.toISOString().slice(0, 10);
  }
  return dateStr;
}

function getLocalCalendarDate(tsSeconds, offset = -3) {
  const d = new Date(tsSeconds * 1000);
  const localMs = d.getTime() + (offset * 3600 * 1000);
  return new Date(localMs).toISOString().slice(0, 10);
}

function getSonoDormiDate(tsSeconds) {
  return getLogicalDate(tsSeconds, -3, cutOff);
}

function msToISODuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const rem = totalMinutes % 1440;
  const hours = Math.floor(rem / 60);
  const minutes = rem % 60;

  let s = "P";
  if (days) s += `${days}D`;
  s += "T";
  if (hours) s += `${hours}H`;
  if (minutes || (!days && !hours)) s += `${minutes}M`;
  return s;
}

async function appendTaskToSection({ dateStr, taskText }) {
  const { filePath, fmObj, body } = await readDaily({ dateStr });
  
  const newTask = ` - [ ] ${taskText}\n`;
  const sectionMatch = body.match(/##\s*Tarefas\n/);
  
  let newBody;
  if (!sectionMatch) {
    newBody = body + "\n## Tarefas\n" + newTask;
  } else {
    const idx = body.indexOf(sectionMatch[0]) + sectionMatch[0].length;
    newBody = body.slice(0, idx) + newTask + body.slice(idx);
  }
  
  await writeDaily({ filePath, fmObj, body: newBody });
  return { filePath, task: taskText };
}

module.exports = {
  vaultPath,
  dailyFolder,
  cutOff,
  splitFrontmatter,
  buildFrontmatter,
  ensureDailyNote,
  readDaily,
  writeDaily,
  appendTaskToSection,
  upsertRootKey,
  time: {
    toIsoMinuteZ,
    dateFromTsUTC,
    shiftDateStrUTC,
    getSonoDormiDate,
    getLogicalDate,
    getLocalCalendarDate,
    msToISODuration,
  },
};
