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

async function handle({ msg, parsed, chat }) {
    return;
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
};