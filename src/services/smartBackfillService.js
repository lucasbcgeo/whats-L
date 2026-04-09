const fs = require("fs");
const path = require("path");
const { data } = require("../config");
const { getTargetChats } = require("../lib/whatsappClient");
const { checkpoint } = require("./dedupeService");

const PROFILE_CHECKPOINT_FILE = path.join(__dirname, "..", "..", "data", "profile_checkpoints.json");

const MAX_BACKFILL_GAP = 300;

function loadProfileCheckpoints() {
    try {
        if (!fs.existsSync(PROFILE_CHECKPOINT_FILE)) return {};
        return JSON.parse(fs.readFileSync(PROFILE_CHECKPOINT_FILE, "utf8"));
    } catch { return {}; }
}

function saveProfileCheckpoints(checkpoints) {
    try {
        fs.writeFileSync(PROFILE_CHECKPOINT_FILE, JSON.stringify(checkpoints, null, 2), "utf8");
    } catch (e) {
        console.error("[PROFILE CHECKPOINT] Erro ao salvar:", e.message);
    }
}

function getProfileTimestamp(profileKey, profilesState) {
    return profilesState[profileKey]?.lastTs || 0;
}

function updateProfileTimestamp(profileKey, lastTs) {
    const profiles = loadProfileCheckpoints();
    if (!profiles[profileKey]) {
        profiles[profileKey] = { lastTs: 0 };
    }
    profiles[profileKey].lastTs = lastTs;
    saveProfileCheckpoints(profiles);
}

function getAllContactsForProfile(profileKey) {
    const profile = data.profiles?.[profileKey];
    if (!profile) return { contacts: [], groups: [] };

    const contacts = profile.match?.contacts || [];
    const groups = profile.match?.groups || [];

    return { contacts, groups };
}

function resolveProfileNumbers(profileKey) {
    const { contacts, groups } = getAllContactsForProfile(profileKey);
    const resolved = { contacts: [], groups: [] };

    for (const contactKey of contacts) {
        const contact = data.labels?.contacts?.[contactKey];
        if (contact?.number) resolved.contacts.push(contact.number);
    }

    for (const groupKey of groups) {
        const group = data.labels?.groups?.[groupKey];
        if (group?.groupNames) {
            resolved.groups.push(...group.groupNames);
        }
    }

    return resolved;
}

async function getProfileChats(profileKey, client) {
    const { contacts, groups } = resolveProfileNumbers(profileKey);
    const allChats = await client.getChats();
    const profileChats = [];

    for (const contact of contacts) {
        const contactId = contact.includes("@c.us") ? contact : `${contact}@c.us`;
        const chat = allChats.find(c => c.id._serialized === contactId);
        if (chat) profileChats.push(chat);
    }

    for (const groupName of groups) {
        const chat = allChats.find(c => c.isGroup && c.name?.includes(groupName));
        if (chat) profileChats.push(chat);
    }

    return profileChats;
}

async function smartBackfill(processMessageFn, client) {
    const profilesState = loadProfileCheckpoints();
    const currentTime = Math.floor(Date.now() / 1000);
    const globalCheckpoint = checkpoint.getLastTs();
    const timeDiff = currentTime - globalCheckpoint;

    console.log(`[SMART BACKFILL] Início | global: ${globalCheckpoint} | agora: ${currentTime} | diff: ${timeDiff}s`);

    if (timeDiff <= MAX_BACKFILL_GAP) {
        console.log(`[SMART BACKFILL] Apenas ${timeDiff}s. Pulando.`);
        return;
    }

    const activeProfiles = Object.keys(data.profiles || {});
    console.log(`[SMART BACKFILL] Profiles: ${activeProfiles.join(", ")}`);

    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const profileKey of activeProfiles) {
        const profileLastTs = getProfileTimestamp(profileKey, profilesState);
        if (profileLastTs >= globalCheckpoint) {
            console.log(`[SMART BACKFILL] ${profileKey}: pulando (já atualizado)`);
            continue;
        }

        console.log(`[SMART BACKFILL] ${profileKey}: buscando desde ${profileLastTs}...`);

        try {
            const profileChats = await getProfileChats(profileKey, client);
            if (profileChats.length === 0) {
                console.log(`[SMART BACKFILL] ${profileKey}: nenhum chat encontrado`);
                continue;
            }

            let profileProcessed = 0;
            let profileSkipped = 0;
            let latestTs = profileLastTs;

            for (const chat of profileChats) {
                const batch = await chat.fetchMessages({ limit: 100, before: undefined });
                if (!batch || batch.length === 0) continue;

                const newMessages = batch.filter(m => m.timestamp > profileLastTs);
                if (newMessages.length === 0) continue;

                newMessages.sort((a, b) => a.timestamp - b.timestamp);

                for (const msg of newMessages) {
                    const did = await processMessageFn(msg, { silent: true, force: true });
                    if (did) {
                        profileProcessed++;
                        if (msg.timestamp > latestTs) latestTs = msg.timestamp;
                    } else {
                        profileSkipped++;
                    }
                }
            }

            if (latestTs > profileLastTs) {
                updateProfileTimestamp(profileKey, latestTs);
            }

            totalProcessed += profileProcessed;
            totalSkipped += profileSkipped;
            console.log(`[SMART BACKFILL] ${profileKey}: ${profileProcessed} processadas, ${profileSkipped} ignoradas`);

        } catch (e) {
            console.error(`[SMART BACKFILL] ${profileKey} erro:`, e.message);
        }
    }

    console.log(`[SMART BACKFILL] TOTAL: ${totalProcessed} processadas, ${totalSkipped} ignoradas`);
}

module.exports = { smartBackfill, updateProfileTimestamp, getProfileTimestamp };