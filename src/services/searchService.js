const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs-extra");
const { resolveSourceAlias } = require("../resolvers/aliasResolver");

const LUCAS_DB = "G:/Lucas/.db/vault.db";
const FRANKLIN_DB = "G:/Franklin/.db/franklin.db";

const LUCAS_ATTACHMENTS = "G:/Lucas/99_Sistema/Anexos";
const FRANKLIN_ATTACHMENTS = "G:/Franklin/Outros/Anexos";

const SOURCES = {
    lucas: { db: LUCAS_DB, attachmentsDir: LUCAS_ATTACHMENTS, label: "Lucas" },
    franklin: { db: FRANKLIN_DB, attachmentsDir: FRANKLIN_ATTACHMENTS, label: "Franklin" },
};

function fuzzyMatch(text, term) {
    const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const termLower = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = termLower.split(/\s+/);
    return words.every(w => lower.includes(w));
}

function searchDbFranklin(term) {
    const results = [];
    try {
        const db = new Database(FRANKLIN_DB, { readonly: true });
        const views = ["view_financeira", "view_juridica", "view_medica"];

        for (const view of views) {
            const rows = db.prepare(`SELECT anexo, anexo_path FROM ${view} WHERE anexo IS NOT NULL AND anexo != ''`).all();
            for (const row of rows) {
                if (fuzzyMatch(row.anexo, term)) {
                    const fullPath = path.join("G:/Franklin", row.anexo_path);
                    if (fs.existsSync(fullPath)) {
                        results.push({ name: row.anexo, path: fullPath, source: "Franklin", view });
                    }
                }
            }
        }
        db.close();
    } catch (e) {
        console.error("[SEARCH] Erro ao consultar Franklin .db:", e.message);
    }
    return results;
}

function searchDbLucas(term) {
    const results = [];
    try {
        const db = new Database(LUCAS_DB, { readonly: true });
        const rows = db.prepare("SELECT anexo, anexo_path FROM notas WHERE anexo IS NOT NULL AND anexo != ''").all();
        for (const row of rows) {
            if (fuzzyMatch(row.anexo, term)) {
                const fullPath = path.join("G:/Lucas", row.anexo_path);
                if (fs.existsSync(fullPath)) {
                    results.push({ name: row.anexo, path: fullPath, source: "Lucas" });
                }
            }
        }
        db.close();
    } catch (e) {
        console.error("[SEARCH] Erro ao consultar Lucas .db:", e.message);
    }
    return results;
}

function searchFolder(dir, term, label) {
    const results = [];
    try {
        if (!fs.existsSync(dir)) return results;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (fuzzyMatch(file, term)) {
                results.push({ name: file, path: path.join(dir, file), source: label });
            }
        }
    } catch (e) {
        console.error("[SEARCH] Erro ao escanear pasta", dir, ":", e.message);
    }
    return results;
}

function normalizeSource(input) {
    if (!input) return null;

    // Try alias resolver first
    const alias = resolveSourceAlias(input);
    if (alias && alias.type === "vault") {
        if (alias.vault) return alias.vault;
        if (alias.path && alias.path.toLowerCase().includes("lucas")) return "lucas";
        if (alias.path && alias.path.toLowerCase().includes("franklin")) return "franklin";
    }

    // Fallback to original logic
    const lower = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(docs?|documentos?|cofre|vault)\b/g, "").trim();
    if (lower.includes("franklin")) return "franklin";
    if (lower.includes("lucas")) return "lucas";
    return null;
}

function searchFiles(term, sourceFilter) {
    let results = [];
    const filter = normalizeSource(sourceFilter);

    const sources = filter
        ? Object.entries(SOURCES).filter(([k]) => k === filter)
        : Object.entries(SOURCES);

    for (const [key, src] of sources) {
        if (key === "franklin") {
            results = results.concat(searchDbFranklin(term));
        } else if (key === "lucas") {
            results = results.concat(searchDbLucas(term));
        }
    }

    if (results.length === 0) {
        for (const [key, src] of sources) {
            results = results.concat(searchFolder(src.attachmentsDir, term, src.label));
        }
    }

    const seen = new Set();
    return results.filter(r => {
        if (seen.has(r.path)) return false;
        seen.add(r.path);
        return true;
    });
}

module.exports = { searchFiles };
