const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs-extra");
const { resolveSource, data } = require("../config/commands");

function getSources() {
    return Object.entries(data.sources || {}).map(([id, config]) => ({
        id,
        db: config.db,
        attachments: config.attachments,
        label: id,
    }));
}

function fuzzyMatch(text, term) {
    const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const termLower = term.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = termLower.split(/\s+/);
    return words.every(w => lower.includes(w));
}

function searchDb(src, term) {
    const results = [];
    try {
        const db = new Database(src.db, { readonly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'view_%'").all();
        
        for (const table of tables) {
            const rows = db.prepare(`SELECT anexo, anexo_path FROM ${table.name} WHERE anexo IS NOT NULL AND anexo != ''`).all();
            for (const row of rows) {
                if (fuzzyMatch(row.anexo, term)) {
                    const root = path.dirname(src.db).replace(/[-_]?db$/i, "");
                    const fullPath = path.join(root, row.anexo_path);
                    if (fs.existsSync(fullPath)) {
                        results.push({ name: row.anexo, path: fullPath, source: src.label, view: table.name });
                    }
                }
            }
        }

        if (results.length === 0) {
            try {
                const rows = db.prepare("SELECT anexo, anexo_path FROM anexos WHERE anexo IS NOT NULL AND anexo != ''").all();
                for (const row of rows) {
                    if (fuzzyMatch(row.anexo, term)) {
                        const root = path.dirname(src.db).replace(/[-_]?db$/i, "");
                        const fullPath = path.join(root, row.anexo_path);
                        if (fs.existsSync(fullPath)) {
                            results.push({ name: row.anexo, path: fullPath, source: src.label });
                        }
                    }
                }
            } catch {}
        }

        db.close();
    } catch (e) {
        console.error("[SEARCH] Erro ao consultar", src.db, ":", e.message);
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

function searchFiles(term, sourceFilter) {
    let results = [];
    const allSources = getSources();
    
    const sourceId = resolveSource(sourceFilter);
    const sources = sourceId
        ? allSources.filter(s => s.id === sourceId)
        : allSources;

    for (const src of sources) {
        results = results.concat(searchDb(src, term));
    }

    if (results.length === 0) {
        for (const src of sources) {
            results = results.concat(searchFolder(src.attachments, term, src.label));
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
