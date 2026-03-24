const { AUDIO_SOURCE_NUMBERS } = require("../config/env");

const { data } = require("../config/commands");

const KEYWORD_MAP = [];
for (const [handler, config] of Object.entries(data.commands || {})) {
  const triggers = config.triggers;
  if (Array.isArray(triggers)) {
    for (const trigger of triggers) {
      const normKw = trigger.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      KEYWORD_MAP.push({ kw: normKw, cmd: trigger });
    }
  } else if (typeof triggers === "object") {
    for (const [subKey, subConfig] of Object.entries(triggers)) {
      for (const variation of subConfig.variations) {
        const normKw = variation.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        KEYWORD_MAP.push({ kw: normKw, cmd: variation });
      }
    }
  }
}

function fuzzyParseCommand(text) {
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const { kw, cmd } of KEYWORD_MAP) {
    if (normalized.includes(kw)) {
      const idx = normalized.indexOf(kw);
      const after = normalized.slice(idx + kw.length).trim();
      const args = after ? after.split(/\s+/) : [];
      return { raw: `#${cmd}${args.length ? " " + args.join(" ") : ""}`, cmd, args, _fuzzy: true };
    }
  }
  return null;
}
const { transcribeAudio } = require("../services/transcriptionService");
const { parseCommand } = require("../utils/parse");
const { time } = require("../services/obsidianService");
const { getHandlerMetricName, saveUndoContext } = require("../services/undoService");
const { getLogicalDate } = time;
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");

async function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)),
  ]);
}

module.exports = {
  match({ msg, chat }) {
    if (!chat?.isGroup) return false;
    return msg.hasMedia && (msg.type === "audio" || msg.type === "ptt");
  },

  async handle({ msg, chat }) {
    const client = msg.client;
    console.log(`\n[AUDIO HANDLER] Processando audio do grupo: ${chat.name}`);

    const tempDir = os.tmpdir();
    let tempInput = null;
    let tempWav = null;

    try {
      const media = await withTimeout(msg.downloadMedia(), 30000, "downloadMedia");
      if (!media) {
        console.error("[AUDIO HANDLER] Mídia não disponível ou expirada.");
        try { await msg.reply("Não consegui baixar o áudio. Pode ter expirado. Tente enviar novamente."); } catch {}
        return;
      }

      const ext = media.mimetype.includes("ogg") ? ".ogg" : ".wav";
      tempInput = path.join(tempDir, `audio-${Date.now()}${ext}`);
      tempWav = path.join(tempDir, `audio-${Date.now()}.wav`);

      await fs.writeFile(tempInput, media.data, "base64");
      await withTimeout(convertToWav(tempInput, tempWav), 30000, "convertToWav");

      console.log("[AUDIO HANDLER] Transcrevendo...");
      const transcription = await withTimeout(transcribeAudio(tempWav), 120000, "transcribeAudio");
      console.log("[AUDIO HANDLER] Transcrição:", transcription);

      if (!transcription || !transcription.trim()) {
        console.log("[AUDIO HANDLER] Transcrição vazia.");
        try { await msg.reply("Não consegui entender o áudio. Tente falar mais claramente."); } catch {}
        return;
      }

      const trimmed = transcription.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let parsed = null;

      const registroMatch = trimmed.match(/^registro\s+(.+)/);
      if (registroMatch) {
        parsed = parseCommand("#" + registroMatch[1].trim());
        if (parsed) console.log("[AUDIO HANDLER] Registro prefix match:", parsed.raw);
      }

      if (!parsed) {
        parsed = fuzzyParseCommand(trimmed);
        if (parsed) console.log("[AUDIO HANDLER] Fuzzy match:", parsed.raw);
      }

      if (parsed) {
        for (const h of require("./index.js")) {
          if (h !== module.exports && h.match({ msg, parsed, chat })) {
            try {
              const result = await h.handle({ msg, parsed, chat });
              console.log("[AUDIO HANDLER] Handler executado:", h.constructor?.name || "handler");

              if (result && result.key) {
                const metric = getHandlerMetricName(h);
                if (metric) {
                  saveUndoContext(msg.id?._serialized, {
                    metric,
                    timestamp: msg.timestamp,
                    key: result.key,
                    value: result.value,
                  });
                }
              }
            } catch (handlerErr) {
              console.error("[AUDIO HANDLER] Erro no handler delegado:", handlerErr.message);
              try { await msg.reply("Erro ao executar o comando do áudio."); } catch {}
            }
            break;
          }
        }
      } else {
        console.log("[AUDIO HANDLER] Transcricao nao reconhecida:", trimmed);
        const allTriggers = require("../config/commands").getAllTriggers().join(", ");
        try { await msg.reply(`Não reconheci um comando no áudio. Comandos: ${allTriggers}`); } catch {}
      }
    } catch (e) {
      console.error("[AUDIO HANDLER] Erro:", e.message);
      try { await msg.reply("Erro ao processar o áudio. Tente novamente."); } catch {}
    } finally {
      if (tempInput) await fs.remove(tempInput).catch(() => {});
      if (tempWav) await fs.remove(tempWav).catch(() => {});
    }
  },
};
