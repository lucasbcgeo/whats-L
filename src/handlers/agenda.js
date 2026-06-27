const fs = require("fs");
const path = require("path");
const { getHandlerForTrigger, data, getMessageSenderId } = require("../config");
const cacheService = require("../services/contactCacheService");

const pendingSelections = new Map();
const SELECTION_TTL = 5 * 60 * 1000;

const CONTACTS_FILE = path.join(__dirname, "..", "..", "data", "contacts.json");
const CONTACTS_ALLOWED_FILE = path.join(__dirname, "..", "..", "data", "contacts_allowed.json");

function normalize(str) {
    return (str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function cleanExpired() {
    const now = Date.now();
    for (const [k, v] of pendingSelections) {
        if (now - v.ts > SELECTION_TTL) pendingSelections.delete(k);
    }
}

function getAgendaConfig() {
    return data.agenda || {};
}

function getLabels() {
    return data.labels?.groups || {};
}

function resolveGroupKey(groupName) {
    const labels = getLabels();
    for (const [key, cfg] of Object.entries(labels)) {
        const names = cfg.groupNames || [];
        if (names.includes(groupName)) return key;
    }
    return null;
}

function isSenderInList(senderId, list) {
    if (!Array.isArray(list)) return false;
    return list.some(n => normalize(n) === normalize(senderId));
}

function selectScope({ isGroup, groupName, senderId }) {
    const cfg = getAgendaConfig();

    if (isGroup && groupName) {
        const groupKey = resolveGroupKey(groupName);
        if (groupKey === cfg.adminGroupKey && isSenderInList(senderId, cfg.adminSenders)) {
            return "full";
        }
        if (groupKey === cfg.allowedGroupKey) {
            return "allowed";
        }
        return null;
    }

    if (!isGroup && isSenderInList(senderId, cfg.dmAllowedSenders)) {
        return "allowed";
    }
    return null;
}

function parseSelection(body) {
    const normalized = (body || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const numberWords = {
        "um": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
        "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
    };
    const digitMatch = normalized.match(/^[\d,\-\s]+$/);
    if (digitMatch) {
        const parts = normalized.split(",");
        const out = [];
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes("-")) {
                const [start, end] = trimmed.split("-").map(n => parseInt(n.trim(), 10));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) out.push(i - 1);
                }
            } else if (trimmed) {
                const num = parseInt(trimmed, 10);
                if (!isNaN(num)) out.push(num - 1);
            }
        }
        return out;
    }
    const wordParts = normalized.split(/[\s,]+/);
    const out = [];
    for (const part of wordParts) {
        if (numberWords[part]) out.push(numberWords[part] - 1);
    }
    return out;
}

function isSelectionBody(body) {
    return parseSelection(body).length > 0;
}

let testClient = null;
let testContactsPath = null;
let testAllowedPath = null;

function _setClientForTest(c) { testClient = c; }
function _setCachePathsForTest(full, allowed) {
    testContactsPath = full;
    testAllowedPath = allowed;
}
function _resetForTest() {
    testClient = null;
    testContactsPath = null;
    testAllowedPath = null;
    pendingSelections.clear();
}

function getClient() {
    if (testClient) return testClient;
    const { client } = require("../lib/whatsappClient");
    return client;
}

function getPaths() {
    if (testContactsPath && testAllowedPath) {
        return { full: testContactsPath, allowed: testAllowedPath };
    }
    return { full: CONTACTS_FILE, allowed: CONTACTS_ALLOWED_FILE };
}

async function sendDM(senderId, text) {
    const client = getClient();
    const chat = await client.getChatById(senderId);
    await chat.sendMessage(text);
    console.log(`[AGENDA] DM enviada para ${senderId}`);
}

async function sendContactDM(senderId, contact) {
    const client = getClient();
    const contactId = contact.numbers[0];
    try {
        const whatsappContact = await client.getContactById(contactId);
        await client.sendMessage(senderId, whatsappContact);
        console.log(`[AGENDA] contato enviado para ${senderId}: ${contact.name}`);
    } catch (e) {
        console.error("[AGENDA] erro ao enviar contato, usando texto:", e.message);
        await sendDM(senderId, formatContact(contact));
    }
}

function formatContact(c) {
    return `${c.name}: ${c.numbers.join(", ")}`;
}

async function handle({ msg, parsed, chat }) {
    const body = (msg.body || "").trim();
    const isGroup = !!chat?.isGroup;
    const senderId = getMessageSenderId(msg, isGroup);
    const paths = getPaths();

    const pending = pendingSelections.get(senderId);
    if (pending && isSelectionBody(body)) {
        const indices = parseSelection(body);
        const valid = indices.filter(i => i >= 0 && i < pending.options.length);
        if (valid.length === 0) {
            await sendDM(senderId, "Número inválido. Envie novamente.");
            return;
        }
        if (valid.length > 1) {
            await sendDM(senderId, "Envie apenas um número.");
            return;
        }
        const chosen = pending.options[valid[0]];
        pendingSelections.delete(senderId);
        await sendContactDM(senderId, chosen);
        return;
    }

    const termo = (parsed?.args || []).join(" ").trim();
    if (!termo) {
        await sendDM(senderId, "Uso: #agenda <nome do contato>");
        return;
    }

    const scope = selectScope({ isGroup, groupName: isGroup ? chat.name : null, senderId });
    if (!scope) {
        console.log(`[AGENDA] sem escopo para sender=${senderId} group=${chat?.name}`);
        return;
    }

    const cachePath = scope === "full" ? paths.full : paths.allowed;
    if (scope === "full") {
        await cacheService.ensureCache({ filePath: cachePath, client: getClient() });
    }

    let results = cacheService.findByTerm({ filePath: cachePath, term: termo });

    if (scope === "full" && results.length === 0) {
        console.log(`[AGENDA] "${termo}" não encontrado, tentando resync`);
        try {
            await cacheService.resync({ filePath: cachePath, client: getClient() });
            results = cacheService.findByTerm({ filePath: cachePath, term: termo });
        } catch (e) {
            console.error("[AGENDA] erro no resync:", e.message);
        }
    }

    if (results.length === 0) {
        await sendDM(senderId, `Contato "*${termo}*" não encontrado.`);
        return;
    }

    if (results.length === 1) {
        await sendContactDM(senderId, results[0]);
        return;
    }

    const list = results.map((r, i) => `${i + 1}. ${r.name} — ${r.numbers.join(", ")}`).join("\n");
    const text = `Encontrei ${results.length} contatos:\n${list}\n\nResponda com o número.`;
    await sendDM(senderId, text);
    pendingSelections.set(senderId, {
        type: "contact",
        options: results,
        ts: Date.now(),
    });
}

function match({ msg, parsed, chat }) {
    cleanExpired();
    const body = (msg.body || "").trim();

    const isGroup = !!chat?.isGroup;
    const senderId = getMessageSenderId(msg, isGroup);
    const pending = pendingSelections.get(senderId);
    if (pending && isSelectionBody(body)) return true;

    if (!parsed) return false;
    if (getHandlerForTrigger(parsed.cmd) !== "agenda") return false;

    const groupName = isGroup ? chat.name : null;
    const scope = selectScope({ isGroup, groupName, senderId });
    return scope !== null;
}

module.exports = {
    replaySafe: false,
    pendingSelections,
    match,
    handle,
    selectScope,
    parseSelection,
    isSelectionBody,
    _setClientForTest,
    _setCachePathsForTest,
    _resetForTest,
};
