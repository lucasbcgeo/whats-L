const { getTargetChats } = require("../lib/whatsappClient");
const { checkpoint } = require("./dedupeService");
const { BACKFILL_LIMIT } = require("../config/env");

async function syncMissedMessagesByCheckpoint(processMessageFn) {
  const { FORWARD_SOURCE_NUMBERS } = require("../config/env");
  const targetChats = await getTargetChats(FORWARD_SOURCE_NUMBERS);

  if (targetChats.length === 0) {
    console.log("⚠️ Nenhum chat alvo encontrado para sync.");
    return;
  }

  let lastTs = checkpoint.getLastTs();
  console.log(`🔄 Sync por checkpoint. last_ts=${lastTs} | limit=${BACKFILL_LIMIT} | chats=${targetChats.length}`);

  for (const chat of targetChats) {
    console.log(`\n--- Sync chat: ${chat.name || chat.id._serialized} ---`);
    try {
      let before = undefined;
      let loops = 0;
      let processed = 0;
      let skipped = 0;

      while (loops < 50) {
        loops++;
        const opts = { limit: BACKFILL_LIMIT };
        if (before) opts.before = before;

        const batch = await chat.fetchMessages(opts);
        if (!batch || batch.length === 0) break;

        const sorted = batch.slice().sort((a, b) => a.timestamp - b.timestamp);
        if (sorted[sorted.length - 1].timestamp <= lastTs) break;

        let anyAdvanced = false;
        for (const msg of sorted) {
          if (msg.timestamp <= lastTs) continue;

          const did = await processMessageFn(msg, { silent: true });
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
