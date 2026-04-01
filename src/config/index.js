const fs = require("fs");
const path = require("path");

const COMMANDS_FILE = path.join(__dirname, "..", "..", "data", "config.json");

let data = { commands: {}, sources: {}, destinations: {} };
let triggerToHandler = {};
let triggerToKey = {};
let triggerToSource = {};

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function load() {
    try {
        const raw = fs.readFileSync(COMMANDS_FILE, "utf8");
        data = JSON.parse(raw);
    } catch (e) {
        console.error("[CONFIG] Erro ao carregar config.json:", e.message);
        data = { commands: {}, sources: {}, destinations: {} };
    }

    triggerToHandler = {};
    triggerToKey = {};
    triggerToSource = {};

    for (const [cmdName, config] of Object.entries(data.commands || {})) {
        const triggers = config.triggers;
        const handler = config.handler || cmdName;

        if (Array.isArray(triggers)) {
            for (const trigger of triggers) {
                const norm = normalize(trigger);
                triggerToHandler[norm] = handler;
                triggerToKey[norm] = config.key || null;
            }
        } else if (typeof triggers === "object") {
            for (const [subKey, subConfig] of Object.entries(triggers)) {
                for (const variation of subConfig.variations) {
                    const norm = normalize(variation);
                    triggerToHandler[norm] = handler;
                    triggerToKey[norm] = config.key || null;
                }
            }
        }
    }

    for (const [sourceId, config] of Object.entries(data.sources || {})) {
        for (const trigger of config.triggers || []) {
            const norm = normalize(trigger);
            triggerToSource[norm] = sourceId;
        }
    }
}

load();

function reload() {
    load();
}

function resolveSource(input) {
    if (!input) return null;
    const norm = normalize(input);
    if (triggerToSource[norm]) return triggerToSource[norm];
    for (const [trigger, sourceId] of Object.entries(triggerToSource)) {
        if (norm.includes(trigger) || trigger.includes(norm)) {
            return sourceId;
        }
    }
    return null;
}

function getSourceConfig(sourceId) {
    return data.sources?.[sourceId] || null;
}

function getAllSources() {
    return Object.entries(data.sources || {}).map(([id, config]) => ({
        id,
        db: config.db,
        attachments: config.attachments,
        label: id,
    }));
}

function resolveDestination(input) {
    if (!input) return null;
    const norm = normalize(input);
    for (const [alias, config] of Object.entries(data.destinations || {})) {
        if (normalize(alias) === norm) return config;
    }
    return null;
}

function getHandlerForTrigger(cmd) {
    const norm = normalize(cmd);
    return triggerToHandler[norm] || null;
}

function getKeyForTrigger(cmd) {
    const norm = normalize(cmd);
    return triggerToKey[norm] || null;
}

function findCommandByHandler(handlerName) {
    for (const config of Object.values(data.commands || {})) {
        if (config.handler === handlerName) return config;
    }
    return null;
}

function getHandlerConfig(handlerName) {
    return findCommandByHandler(handlerName);
}

function getSection(handlerName) {
    return findCommandByHandler(handlerName)?.section || null;
}

function getKey(handlerName) {
    return findCommandByHandler(handlerName)?.key || null;
}

function getAllTriggers() {
    const all = [];
    for (const config of Object.values(data.commands || {})) {
        const triggers = config.triggers;
        if (Array.isArray(triggers)) {
            all.push(...triggers);
        } else if (typeof triggers === "object") {
            for (const subConfig of Object.values(triggers)) {
                all.push(...subConfig.variations);
            }
        }
    }
    return all;
}

function getTriggerMapping(handlerName) {
    const cmd = findCommandByHandler(handlerName);
    const triggers = cmd?.triggers;
    if (typeof triggers === "object" && !Array.isArray(triggers)) {
        return triggers;
    }
    return null;
}

function resolveProfile({ groupName, number }) {
    const contacts = data.labels?.contacts || {};
    const groups = data.labels?.groups || {};
    
    for (const [profileName, profile] of Object.entries(data.profiles || {})) {
        const match = profile.match || {};
        
        let groupMatch = false;
        let numberMatch = false;
        
        if (match.groups && groupName) {
            for (const groupKey of match.groups) {
                const groupConfig = groups[groupKey];
                if (groupConfig?.groupNames && groupConfig.groupNames.includes(groupName)) {
                    groupMatch = true;
                    break;
                }
            }
        }
        
        if (match.groupName && groupName && match.groupName === groupName) {
            groupMatch = true;
        }
        
        if (match.contacts && number) {
            for (const contactKey of match.contacts) {
                const contactConfig = contacts[contactKey];
                
                // Check main numbers
                if (contactConfig?.numbers && contactConfig.numbers.includes(number)) {
                    numberMatch = true;
                    break;
                }
                
                // Check sublabels
                if (contactConfig?.sublabels) {
                    for (const sublabelConfig of Object.values(contactConfig.sublabels)) {
                        if (sublabelConfig?.numbers && sublabelConfig.numbers.includes(number)) {
                            numberMatch = true;
                            break;
                        }
                    }
                }
                
                if (numberMatch) break;
            }
        }
        
        if (match.numbers && number && match.numbers.includes(number)) {
            numberMatch = true;
        }
        if (match.number && number && match.number === number) {
            numberMatch = true;
        }
        
        const hasGroupMatch = match.groupName || match.groups;
        const hasNumberMatch = match.numbers || match.number || match.contacts;
        
        if (hasGroupMatch && hasNumberMatch) {
            if (groupMatch || numberMatch) return profileName;
        } else if (hasGroupMatch) {
            if (groupMatch) return profileName;
        } else if (hasNumberMatch) {
            if (numberMatch) return profileName;
        }
    }
    return null;
}

function isHandlerAllowed(profileName, handlerName) {
    const profile = data.profiles?.[profileName];
    if (!profile) return true;

    const exclude = profile.exclude || [];

    if (exclude.includes(handlerName)) return false;

    if (profile.features) {
        const allowed = new Set();
        for (const featureName of profile.features) {
            const feature = data.features?.[featureName];
            if (!feature) continue;
            if (feature.commands) {
                for (const c of feature.commands) {
                    const handler = data.commands?.[c]?.handler;
                    if (handler) allowed.add(handler);
                }
            }
        }
        return allowed.has(handlerName);
    }

    const { handlers = [] } = profile;
    if (handlers.includes("*")) return true;
    return handlers.includes(handlerName);
}

function isGroupAllowed(profileName, groupName) {
    const profile = data.profiles?.[profileName];
    if (!profile) return true;
    const groups = data.labels?.groups || {};
    
    const matchGroups = profile.match?.groups || [];
    if (matchGroups.length === 0) return true;
    
    for (const groupKey of matchGroups) {
        const groupConfig = groups[groupKey];
        if (groupConfig?.groupNames && groupConfig.groupNames.includes(groupName)) {
            return true;
        }
    }
    
    return false;
}

function isDestinationAllowed(profileName, targetChat, senderId) {
    const profile = data.profiles?.[profileName];
    if (!profile) return true;
    const allowed = profile.allowedDestinations;
    if (!allowed) return true;

    if (!targetChat.isGroup) {
        if (allowed.includes("self") && targetChat.id._serialized === senderId) return true;
        return false;
    }

    for (const destKey of allowed) {
        if (destKey === "self") continue;
        const destConfig = data.destinations?.[destKey];
        if (destConfig?.groupName === targetChat.name) return true;
    }
    return false;
}

function isSourceAllowed(profileName, sourceKey) {
    const profile = data.profiles?.[profileName];
    if (!profile) return true;
    const allowed = profile.allowedSources;
    if (!allowed) return true;
    return allowed.includes(sourceKey);
}

function getForwarderSources() {
    const sources = {};
    const contacts = data.labels?.contacts || {};
    
    for (const [contactKey, contactConfig] of Object.entries(contacts)) {
        // Check main numbers
        if (contactConfig?.numbers && contactConfig?.label) {
            for (const profile of Object.values(data.profiles || {})) {
                const matchContacts = profile.match?.contacts || [];
                if (!matchContacts.includes(contactKey)) continue;
                
                const allowedDests = profile.allowedDestinations || [];
                for (const destKey of allowedDests) {
                    const destConfig = data.destinations?.[destKey];
                    if (!destConfig?.groupName) continue;
                    
                    for (const num of contactConfig.numbers) {
                        sources[num] = {
                            contactKey,
                            label: contactConfig.label,
                            frequencyDays: contactConfig.frequencyDays || null,
                            targetGroupName: destConfig.groupName
                        };
                    }
                }
            }
        }
        
        // Check sublabels
        if (contactConfig?.sublabels) {
            for (const [sublabelKey, sublabelConfig] of Object.entries(contactConfig.sublabels)) {
                if (!sublabelConfig?.numbers || !sublabelConfig?.label) continue;
                const frequencyDays = contactConfig.frequencyDays || 30;
                
                for (const profile of Object.values(data.profiles || {})) {
                    const matchContacts = profile.match?.contacts || [];
                    if (!matchContacts.includes(contactKey)) continue;
                    
                    const allowedDests = profile.allowedDestinations || [];
                    for (const destKey of allowedDests) {
                        const destConfig = data.destinations?.[destKey];
                        if (!destConfig?.groupName) continue;
                        
                        for (const num of sublabelConfig.numbers) {
                            sources[num] = {
                                contactKey: `${contactKey}.${sublabelKey}`,
                                label: sublabelConfig.label,
                                frequencyDays,
                                targetGroupName: destConfig.groupName
                            };
                        }
                    }
                }
            }
        }
    }
    return sources;
}

function getFileWatcherConfig() {
    for (const profile of Object.values(data.profiles || {})) {
        if (!profile.match?.file) continue;
        const allowedDests = profile.allowedDestinations || [];
        for (const destKey of allowedDests) {
            const destConfig = data.destinations?.[destKey];
            if (destConfig?.groupName) {
                return { file: profile.match.file, groupName: destConfig.groupName };
            }
        }
    }
    return null;
}

module.exports = {
    data,
    reload,
    resolveSource,
    resolveDestination,
    getHandlerForTrigger,
    getKeyForTrigger,
    getHandlerConfig,
    getSection,
    getKey,
    getAllTriggers,
    getTriggerMapping,
    resolveProfile,
    isHandlerAllowed,
    isGroupAllowed,
    isDestinationAllowed,
    isSourceAllowed,
    getForwarderSources,
    getFileWatcherConfig,
};
