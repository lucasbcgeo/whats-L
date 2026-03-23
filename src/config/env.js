require('dotenv').config();
module.exports = {
  VAULT: process.env.OBSIDIAN_VAULT_PATH,
  DAILY_FOLDER: process.env.DAILY_FOLDER,
  GROUP_ID: process.env.GROUP_ID,
  GROUP_NAME: process.env.GROUP_NAME,
  DORMIR_MADRUGADA_ATE: Number(process.env.DORMIR_MADRUGADA_ATE ?? 5),
  BACKFILL_LIMIT: Number(process.env.BACKFILL_LIMIT ?? 500),
  FORWARD_SOURCE_NUMBERS: (process.env.FORWARD_SOURCE_NUMBERS || "").split(",").map(n => n.trim()).filter(Boolean),
  TARGET_FORWARD_GROUP_NAME: process.env.TARGET_FORWARD_GROUP_NAME,
  HEADER_SYNC_FILE: process.env.HEADER_SYNC_FILE,
  HEADER_SYNC_GROUP_ID: process.env.HEADER_SYNC_GROUP_ID,
};
