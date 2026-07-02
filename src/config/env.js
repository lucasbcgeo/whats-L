// dotenv já é carregado em main.js antes deste módulo

module.exports = {
  VAULT: process.env.OBSIDIAN_VAULT_PATH,
  DAILY_FOLDER: process.env.DAILY_FOLDER,
  GROUP_ID: process.env.GROUP_ID,
  DAILY_LOG_CUTOFF: Number(process.env.DAILY_LOG_CUTOFF ?? 5),
  BACKFILL_LIMIT: Number(process.env.BACKFILL_LIMIT ?? 500),
  TRANSCRIPTION_MODEL_PATH: process.env.TRANSCRIPTION_MODEL_PATH || "models/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx",
  OLLAMA_API_KEY: process.env.OLLAMA_API_KEY,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || "gpt-oss:120b",
  OBSIDIAN_REST_API_URL: process.env.OBSIDIAN_REST_API_URL || "https://127.0.0.1:27124",
  OBSIDIAN_REST_API_KEY: process.env.OBSIDIAN_REST_API_KEY || "",
};
