const { data } = require("../config");

const MONTHS = {
    "janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3,
    "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9,
    "outubro": 10, "novembro": 11, "dezembro": 12,
};

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function localDate(timestamp, offset = -3) {
    const d = new Date(timestamp * 1000);
    const localMs = d.getTime() + (offset * 3600 * 1000);
    return new Date(localMs);
}

function parseDateWord(text, timestamp) {
    if (!text) return null;
    const norm = normalize(text.trim());

    const aliases = data.flags?.data?.values || data.dateAliases || {};

    // Verifica aliases do config
    for (const [word, type] of Object.entries(aliases)) {
        if (norm === normalize(word)) {
            const now = localDate(timestamp);
            if (type === "today") return toYMD(now);
            if (type === "yesterday") { now.setDate(now.getDate() - 1); return toYMD(now); }
            if (type === "day_before_yesterday") { now.setDate(now.getDate() - 2); return toYMD(now); }
            if (type === "tomorrow") { now.setDate(now.getDate() + 1); return toYMD(now); }
        }
    }

    // Formato DD-MM-AAAA ou DD/MM/AAAA
    const dmy = norm.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    // "DD de mes de AAAA"
    const full = norm.match(/^(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})$/);
    if (full) {
        const [, dd, monthName, yyyy] = full;
        const mm = MONTHS[normalize(monthName)];
        if (mm) return `${yyyy}-${String(mm).padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }

    // "DD de mes" (ano corrente)
    const partial = norm.match(/^(\d{1,2})\s+de\s+(\w+)$/);
    if (partial) {
        const [, dd, monthName] = partial;
        const mm = MONTHS[normalize(monthName)];
        if (mm) {
            const yyyy = localDate(timestamp).getFullYear();
            return `${yyyy}-${String(mm).padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
    }

    return null;
}

function resolveDateFlag(flagValue, timestamp) {
    if (!flagValue) return null;
    return parseDateWord(flagValue, timestamp);
}

module.exports = { parseDateWord, resolveDateFlag };
