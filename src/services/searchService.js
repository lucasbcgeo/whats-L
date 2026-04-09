const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs-extra");
const { resolveSource, data } = require("../config");

function getSources() {
    return Object.entries(data.sources || {})
        .filter(([id, config]) => config.db && config.db.trim() !== "")
        .map(([id, config]) => ({
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

function getExistingDateColumns(db, tableName) {
    try {
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const colNames = columns.map(c => c.name.toLowerCase());
        if (colNames.includes('data_ref')) return { dateCol: 'data_ref', hasDateRef: true };
        if (colNames.includes('data_mov')) return { dateCol: 'data_mov', hasDateRef: false };
        if (colNames.includes('data')) return { dateCol: 'data', hasDateRef: false };
        if (colNames.includes('data_criacao')) return { dateCol: 'data_criacao', hasDateRef: false };
        return { dateCol: null, hasDateRef: false };
    } catch {
        return { dateCol: null, hasDateRef: false };
    }
}

function searchDb(src, term, options = {}) {
    if (!src.db || src.db.trim() === "") {
        console.log("[SEARCH] Source sem db, pulando:", src.label);
        return [];
    }
    
    const results = [];
    try {
        const db = new Database(src.db, { readonly: true });
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name LIKE 'view_%'").all();
        
        for (const table of tables) {
            const { dateCol: detectedDateCol, hasDateRef } = getExistingDateColumns(db, table.name);
            if (!detectedDateCol) {
                console.log("[SEARCH] Tabela sem coluna de data:", table.name);
                continue;
            }
            const dateCol = options.dateRefColumn && hasDateRef ? "data_ref" : detectedDateCol;
            const isFinancialTable = table.name.toLowerCase().includes('financeiro') || table.name.toLowerCase().includes('guia_') || table.name.toLowerCase().includes('finan_');
            
            let query = `SELECT anexo, anexo_path, ${dateCol} FROM ${table.name} WHERE anexo IS NOT NULL AND anexo != ''`;
            const params = [];
            
            // Handle date range: start até end
            if (options.dateStart && options.dateEnd) {
                query += ` AND ${dateCol} >= ? AND ${dateCol} <= ?`;
                params.push(options.dateStart, options.dateEnd);
            } else if (options.dateOverride) {
                // Single date
                query += ` AND ${dateCol} = ?`;
                params.push(options.dateOverride);
            } else if (options.dateStart) {
                // Start date only
                query += ` AND ${dateCol} >= ?`;
                params.push(options.dateStart);
            } else if (options.dateEnd) {
                // End date only
                query += ` AND ${dateCol} <= ?`;
                params.push(options.dateEnd);
            }
            
            const rows = db.prepare(query).all(...params);
            for (const row of rows) {
                if (fuzzyMatch(row.anexo, term)) {
                    const root = path.dirname(src.db).replace(/[-_]?db$/i, "");
                    const fullPath = path.join(root, row.anexo_path);
                    if (fs.existsSync(fullPath)) {
                        results.push({ name: row.anexo, path: fullPath, source: src.label, view: table.name, dateUsed: row[dateCol], isFinancial: isFinancialTable });
                    }
                }
            }
        }

        if (results.length === 0) {
            try {
                const { dateCol: detectedDateCol } = getExistingDateColumns(db, 'anexos');
                if (!detectedDateCol) {
                    console.log("[SEARCH] Tabela anexos sem coluna de data");
                    db.close();
                    return results;
                }
                const dateCol = detectedDateCol;
                let query = `SELECT anexo, anexo_path, ${dateCol} FROM anexos WHERE anexo IS NOT NULL AND anexo != ''`;
                const params = [];
                
                // Handle date range: start até end
                if (options.dateStart && options.dateEnd) {
                    query += ` AND ${dateCol} >= ? AND ${dateCol} <= ?`;
                    params.push(options.dateStart, options.dateEnd);
                } else if (options.dateOverride) {
                    query += ` AND ${dateCol} = ?`;
                    params.push(options.dateOverride);
                } else if (options.dateStart) {
                    query += ` AND ${dateCol} >= ?`;
                    params.push(options.dateStart);
                } else if (options.dateEnd) {
                    query += ` AND ${dateCol} <= ?`;
                    params.push(options.dateEnd);
                }
                
                const rows = db.prepare(query).all(...params);
                for (const row of rows) {
                    if (fuzzyMatch(row.anexo, term)) {
                        const root = path.dirname(src.db).replace(/[-_]?db$/i, "");
                        const fullPath = path.join(root, row.anexo_path);
                        if (fs.existsSync(fullPath)) {
                            results.push({ name: row.anexo, path: fullPath, source: src.label, dateUsed: row[dateCol], isFinancial: true });
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
    if (!dir || dir.trim() === "") {
        return [];
    }
    
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

function searchFiles(term, sourceFilter, options = {}) {
    let results = [];
    const allSources = getSources();
    
    const sourceId = resolveSource(sourceFilter);
    const sources = sourceId
        ? allSources.filter(s => s.id === sourceId)
        : allSources;

    for (const src of sources) {
        results = results.concat(searchDb(src, term, options));
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
