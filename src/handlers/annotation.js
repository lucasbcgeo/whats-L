const fs = require("fs");
const path = require("path");
const { getHandlerForTrigger } = require("../config");

function localDate(timestamp, offset = -3) {
    const d = new Date(timestamp * 1000);
    return new Date(d.getTime() + offset * 3600 * 1000).toISOString().slice(0, 10);
}

function parsePayload(raw) {
    const body = (raw || "").replace(/^#\S+\s*/, "");
    const quoted = body.match(/"([^"]*)"/);
    if (!quoted) return null;
    const title = body.slice(0, quoted.index).trim();
    const text = quoted[1].trim();
    if (!title || !text) return null;
    return { title, text };
}

function annotationPath(dateStr) {
    const vault = process.env.OBSIDIAN_VAULT_PATH;
    if (!vault) throw new Error("OBSIDIAN_VAULT_PATH não configurado");
    return path.join(vault, "00_Passageiras", `${dateStr}-Anotação.md`);
}

async function handle({ msg, parsed }) {
    const payload = parsePayload(parsed?.raw);
    if (!payload) return null;

    const dateStr = localDate(msg.timestamp);
    const filePath = annotationPath(dateStr);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trimEnd() : "";
    const block = `## ${payload.title}\n${payload.text}`;
    const next = current ? `${current}\n\n${block}\n` : `${block}\n`;
    fs.writeFileSync(filePath, next, "utf8");
    return { filePath, title: payload.title, value: payload.text };
}

module.exports = {
    match({ parsed }) {
        return !!parsed && getHandlerForTrigger(parsed.cmd) === "annotation";
    },
    handle,
    parsePayload,
};
