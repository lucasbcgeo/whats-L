const fs = require("fs");
const path = require("path");

const THROTTLE_MS = 60 * 1000;
const lastResyncByPath = new Map();
const CONTACT_ID_SUFFIXES = ["@c.us", "@lid"];

function normalize(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, "_");
}

function loadCache(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        const raw = fs.readFileSync(filePath, "utf8");
        if (!raw.trim()) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        console.error("[CONTACT CACHE] Erro ao ler cache:", e.message);
        return {};
    }
}

function saveCache(filePath, data) {
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
        console.error("[CONTACT CACHE] Erro ao salvar cache:", e.message);
    }
}

function findByTerm({ filePath, term }) {
    const cache = loadCache(filePath);
    const termNorm = normalize(term);
    if (!termNorm) return [];

    const results = [];
    for (const [key, entry] of Object.entries(cache)) {
        const nameNorm = normalize(entry?.name || key);
        if (nameNorm.includes(termNorm) || termNorm.includes(nameNorm)) {
            results.push({ name: entry.name || key, numbers: entry.numbers || [] });
        }
        if (results.length >= 5) break;
    }
    return results;
}

async function ensureCache({ filePath, client }) {
    const existing = loadCache(filePath);
    if (Object.keys(existing).length > 0) return existing;
    return await resync({ filePath, client, force: true });
}

async function resync({ filePath, client, force = false }) {
    const now = Date.now();
    const last = lastResyncByPath.get(filePath) || 0;
    if (!force && (now - last) < THROTTLE_MS) {
        console.log("[CONTACT CACHE] resync em throttle, ignorando");
        return loadCache(filePath);
    }
    lastResyncByPath.set(filePath, now);

    const chats = await client.getChats();
    const data = {};
    for (const chat of chats) {
        if (chat.isGroup) continue;
        const name = chat.name || chat.contact?.pushname;
        if (!name) continue;
        const number = chat.id?._serialized;
        if (!number || !CONTACT_ID_SUFFIXES.some(suffix => number.endsWith(suffix))) continue;

        const key = normalize(name);
        if (!data[key]) {
            data[key] = { name, numbers: [number] };
        } else if (!data[key].numbers.includes(number)) {
            data[key].numbers.push(number);
        }
    }
    saveCache(filePath, data);
    console.log(`[CONTACT CACHE] ${Object.keys(data).length} contatos sincronizados em ${filePath}`);
    return data;
}

module.exports = { ensureCache, resync, findByTerm, loadCache, saveCache, normalize };
