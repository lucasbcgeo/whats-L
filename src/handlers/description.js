const fs = require("fs");
const path = require("path");
const { getHandlerForTrigger } = require("../config");
const { resolveDateFlag } = require("../utils/dateParser");

function localDate(timestamp, offset = -3) {
    const d = new Date(timestamp * 1000);
    return new Date(d.getTime() + offset * 3600 * 1000).toISOString().slice(0, 10);
}

function parsePayload(raw) {
    const body = (raw || "").replace(/^#\S+\s*/, "");
    const quoted = body.match(/"([^"]*)"/);
    if (!quoted) return null;

    const beforeQuote = body.slice(0, quoted.index);
    const dataMatch = beforeQuote.match(/--?data:(.+?)\s*$/i);
    return {
        text: quoted[1],
        dataFlag: dataMatch ? dataMatch[1].trim() : null,
    };
}

function splitFrontmatter(markdown) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { lines: [], body: markdown };
    return {
        lines: match[1].split(/\r?\n/).filter(Boolean),
        body: markdown.slice(match[0].length),
    };
}

function quoteYaml(value) {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function setFrontmatterKey(markdown, key, value) {
    const { lines, body } = splitFrontmatter(markdown);
    const nextLine = `${key}: ${quoteYaml(value)}`;
    const idx = lines.findIndex(line => line.trimStart().startsWith(`${key}:`));
    if (idx >= 0) {
        lines[idx] = nextLine;
    } else {
        lines.push(nextLine);
    }
    return `---\n${lines.join("\n")}\n---\n${body.replace(/^\n+/, "")}`;
}

function dailyPath(dateStr) {
    const vault = process.env.OBSIDIAN_VAULT_PATH;
    if (!vault) throw new Error("OBSIDIAN_VAULT_PATH não configurado");
    const folder = process.env.DAILY_FOLDER || "Diario";
    const [yyyy, mm] = dateStr.split("-");
    return path.join(vault, folder, yyyy, mm, `${dateStr}.md`);
}

async function handle({ msg, parsed }) {
    const payload = parsePayload(parsed?.raw);
    if (!payload || !payload.text.trim()) return null;

    const dateStr = payload.dataFlag
        ? resolveDateFlag(payload.dataFlag, msg.timestamp)
        : localDate(msg.timestamp);
    if (!dateStr) return null;

    const filePath = dailyPath(dateStr);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "---\n---\n";
    fs.writeFileSync(filePath, setFrontmatterKey(current, "description", payload.text), "utf8");
    return { filePath, key: "description", value: payload.text };
}

module.exports = {
    match({ parsed }) {
        return !!parsed && getHandlerForTrigger(parsed.cmd) === "description";
    },
    handle,
    parsePayload,
    setFrontmatterKey,
};
