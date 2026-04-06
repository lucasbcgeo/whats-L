const { data } = require("../config");

function parseCommand(text) {
    const raw = (text || "").trim();
    if (!raw.startsWith("#")) return null;

    const parts = raw.split(/\s+/);
    const cmdRaw = parts[0].slice(1).toLowerCase();
    const cmd = cmdRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,!?;:]+$/, "");
    const args = parts.slice(1);
    return { raw, cmd, cmdRaw, args };
}

function hasForceFlag(args) {
    if (!Array.isArray(args)) return false;
    return args.some(a => ["correção", "correcao", "force"].includes(a.toLowerCase()));
}

function normalizeFlagValue(value) {
    const lower = value.toLowerCase();
    if (["sim", "yes", "true", "1"].includes(lower)) return "sim";
    if (["não", "nao", "no", "false", "0"].includes(lower)) return "não";
    return value;
}

function parseFlags(args) {
    const flags = {};
    const remaining = [];
    
    for (const a of args) {
        // data: parsing especial para suportar range de datas
        let dataMatch = a.match(/^--?data:(.+)$/i);
        if (dataMatch) {
            let valuePart = dataMatch[1];
            
            const rangeKeyword = data.flags?.data?.range?.value || "ate";
            
            // Verifica se tem range no valor (ex: "hoje até 15/05")
            const rangeRegex = new RegExp(`^(.+?)\\s+${rangeKeyword}\\s+(.+)$`, 'i');
            const rangeMatch = valuePart.match(rangeRegex);
            
            if (rangeMatch) {
                const startDate = rangeMatch[1].trim();
                const endDate = rangeMatch[2].trim();
                
                const dataValues = data.flags?.data?.values || {};
                
                // Resolve data inicial
                let startResolved = dataValues[startDate] || startDate;
                // Resolve data final  
                let endResolved = dataValues[endDate] || endDate;
                
                flags["data"] = startResolved;
                flags["range"] = endResolved;
            } else {
                // Data única
                const dataValues = data.flags?.data?.values || {};
                let resolved = dataValues[valuePart] || valuePart;
                flags["data"] = resolved;
            }
            continue;
        }
        
        // de e para: : é opcional no escrito (ex: de:franklin ou de franklin ou --de franklin)
        m = a.match(/^--?de(?::|\s+(.+))?$/i) || a.match(/^--?(fonte|source)(?::|\s+(.+))?$/i);
        if (m) {
            flags["de"] = m[2] || m[3] || m[1];
            continue;
        }
        
        m = a.match(/^--?para(?::|\s+(.+))?$/i) || a.match(/^--?(destino|to|destination)(?::|\s+(.+))?$/i);
        if (m) {
            flags["para"] = m[2] || m[3] || m[1];
            continue;
        }
        
        // dataref usa -- sem - (ex: --dataref:sim)
        m = a.match(/^--dataref:(.+)$/i);
        if (m) {
            flags["dataref"] = normalizeFlagValue(m[1]);
            continue;
        }
        
        // Outras flags com --
        m = a.match(/^--([^:]+):(.+)$/);
        if (m) {
            let key = m[1].toLowerCase();
            let value = m[2];
            
            const config = data.flags?.[key];
            if (config?.values) {
                value = normalizeFlagValue(value);
            }
            
            if (config?.aliases) {
                for (const alias of config.aliases) {
                    flags[alias.toLowerCase()] = value;
                }
            }
            
            flags[key] = value;
        } else if (a.startsWith("--")) {
            flags[a.slice(2).toLowerCase()] = true;
        } else if (a.startsWith("-")) {
            flags[a.slice(1).toLowerCase()] = true;
        } else {
            remaining.push(a);
        }
    }
    return { flags, remaining };
}

function extractFlagsFromAudio(text) {
    const flags = {};
    const normalized = text.toLowerCase();
    
    // Procura de e para ANTES do ponto (na frase principal)
    const mainPart = normalized.split('.')[0];
    
    // Procura "de nome" ou "fonte nome" ou "source nome" na parte principal
    const deMatch = mainPart.match(/(?:de|fonte|source)\s+(\S+)/i);
    if (deMatch) {
        flags["de"] = deMatch[1];
    }
    
    // Procura "para nome" - para após a última palavra (nome do arquivo pode ter palavras)
    // Assume que arquivo vem antes de "para", então pegamos tudo após "para"
    const lastParaIndex = mainPart.lastIndexOf("para");
    if (lastParaIndex !== -1) {
        const afterPara = mainPart.slice(lastParaIndex + 4).trim();
        if (afterPara) {
            flags["para"] = afterPara;
        }
    }
    
    // Procura dataref APÓS o ponto (no final)
    const lastPart = normalized.split('.').slice(-1)[0] || "";
    const datarefMatch = lastPart.match(/\s*dataref\s+(sim|nao|yes|no)\s*/i);
    if (datarefMatch) {
        flags["dataref"] = normalizeFlagValue(datarefMatch[1]);
    }
    
    // Procura data APÓS o ponto (no final), incluindo range
    const dataValues = data.flags?.data?.values || {};
    const rangeKeyword = data.flags?.data?.range?.value || "ate";
    
    // Match "data hoje ate 15/05" (usando a keyword do config)
    const rangeRegex = new RegExp(`\\\\s*data\\\\s+(.+?)\\\\s+${rangeKeyword}\\\\s+(.+?)\\\\s*$`, 'i');
    const dataRangeMatch = lastPart.match(rangeRegex);
    if (dataRangeMatch) {
        const startDate = dataRangeMatch[1].trim();
        const endDate = dataRangeMatch[2].trim();
        
        flags["data"] = dataValues[startDate] || startDate;
        flags["range"] = dataValues[endDate] || endDate;
        return flags;
    }
    
    // Match single date "data hoje"
    const dataMatch = lastPart.match(/\s*data\s+(hoje|ontem|anteontem|amanha|amanhã)\s*$/i);
    if (dataMatch) {
        const key = "data";
        const rawValue = dataMatch[1];
        let value = dataValues[rawValue] || rawValue;
        flags[key] = value;
    }
    
    return flags;
}

module.exports = { parseCommand, hasForceFlag, parseFlags, extractFlagsFromAudio };
