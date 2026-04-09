const { getTargetChats } = require("../lib/whatsappClient");
const { checkpoint } = require("./dedupeService");
const { BACKFILL_LIMIT } = require("../config/env");
const { data } = require("../config");
const { client } = require("../lib/whatsappClient");

function getForwardSourceNumbers() {
    const contacts = data.labels?.contacts || {};
    const numbers = [];
    
    for (const profile of Object.values(data.profiles || {})) {
        const matchContacts = profile.match?.contacts || [];
        
        for (const contactKey of matchContacts) {
            const contactConfig = contacts[contactKey];
            if (!contactConfig) continue;
            
            if (contactConfig.numbers) {
                numbers.push(...contactConfig.numbers);
            }
            
            if (contactConfig.sublabels) {
                for (const subConfig of Object.values(contactConfig.sublabels)) {
                    if (subConfig.numbers) {
                        numbers.push(...subConfig.numbers);
                    }
                }
            }
        }
    }
    
    return [...new Set(numbers)];
}

function getProfileGroupNames() {
    const groups = data.labels?.groups || {};
    const groupNames = [];
    
    for (const profile of Object.values(data.profiles || {})) {
        const matchGroups = profile.match?.groups || [];
        
        for (const groupKey of matchGroups) {
            const groupConfig = groups[groupKey];
            if (groupConfig?.groupNames) {
                groupNames.push(...groupConfig.groupNames);
            }
        }
    }
    
    return [...new Set(groupNames)];
}

async function syncMissedMessagesByCheckpoint(processMessageFn, options = {}) {
  const { force } = options;
  const forwardNumbers = getForwardSourceNumbers();
  const profileGroupNames = getProfileGroupNames();
  console.log(`[SYNC] Números para sync: ${forwardNumbers.join(', ')}`);
  console.log(`[SYNC] Grupos dos profiles: ${profileGroupNames.join(', ')}`);
  
  const targetChats = await getTargetChats(forwardNumbers);
  
  const chats = await client.getChats();
  for (const groupName of profileGroupNames) {
    const group = chats.find(c => c.isGroup && c.name === groupName);
    if (group && !targetChats.find(c => c.id._serialized === group.id._serialized)) {
      targetChats.push(group);
      console.log(`[SYNC] Adicionado grupo: ${groupName}`);
    }
  }
  
  console.log(`[SYNC] Chats totales: ${targetChats.map(c => c.name || c.id._serialized).join(', ')}`);

  if (targetChats.length === 0) {
    console.log("⚠️ Nenhum chat alvo encontrado para sync.");
    return;
  }

  let lastTs = checkpoint.getLastTs();
  const modeText = force ? "BACKFILL" : "checkpoint";
  console.log(`🔄 Sync por ${modeText}. last_ts=${lastTs} | limit=${BACKFILL_LIMIT} | chats=${targetChats.length}`);

  async function fetchMessagesWithRetry(chat, opts, maxRetries = 0) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chat.fetchMessages(opts);
    } catch (e) {
      if (e.message?.includes('waitForChatLoading') || e.message?.includes('Cannot read properties')) {
        console.log(`[SYNC] Retry ${i + 1}/${maxRetries} para chat ${chat.name || chat.id._serialized}...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
  if (maxRetries > 0) {
    console.log(`[SYNC] Pulando chat ${chat.name || chat.id._serialized} (inacessível após ${maxRetries} tentativas)`);
  }
  return null;
}

for (const chat of targetChats) {
    console.log(`\n--- Sync chat: ${chat.name || chat.id._serialized} ---`);
    try {
      if (!chat || !chat.fetchMessages) {
        console.error(`❌ Chat inválido: ${chat?.id?._serialized || 'unknown'}`);
        continue;
      }
      let before = undefined;
      let loops = 0;
      let processed = 0;
      let skipped = 0;

      while (loops < 50) {
        loops++;
        const opts = { limit: BACKFILL_LIMIT };
        if (before) opts.before = before;

        const batch = await fetchMessagesWithRetry(chat, opts);
        if (!batch || batch.length === 0) break;

        const sorted = batch.slice().sort((a, b) => a.timestamp - b.timestamp);
        if (sorted[sorted.length - 1].timestamp <= lastTs) break;

        let anyAdvanced = false;
        for (const msg of sorted) {
          if (msg.timestamp <= lastTs) continue;

          const did = await processMessageFn(msg, { silent: true, force: force });
          if (did) {
            processed++;
            anyAdvanced = true;
            checkpoint.setLastTs(msg.timestamp);
          } else {
            skipped++;
          }
        }

        before = sorted[0]?.id?._serialized;
        if (!anyAdvanced) break;
        lastTs = checkpoint.getLastTs();
      }
      console.log(`✅ Sync finalizado para este chat. processadas=${processed} ignoradas=${skipped}`);
    } catch (e) {
      console.error(`❌ Erro no sync do chat ${chat.id._serialized}:`, e && e.stack ? e.stack : e);
    }
  }
  console.log(`\n✅ Sync global finalizado. last_ts=${checkpoint.getLastTs()}`);
}

module.exports = { syncMissedMessagesByCheckpoint };

function getLastCheckpointGlobal() {
    return checkpoint.getLastTs();
}
