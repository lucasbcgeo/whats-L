const { AUDIO_SOURCE_NUMBERS, REF_BOT } = require("../config/env");

const KEYWORD_MAP = [
  { kw: "tarefa", cmd: "tarefa" },
  { kw: "encaminhar", cmd: "encaminhar" },
  { kw: "cafe", cmd: "cafe" },
  { kw: "almoco", cmd: "almoco" },
  { kw: "almocei", cmd: "almoco" },
  { kw: "janta", cmd: "janta" },
  { kw: "jantei", cmd: "janta" },
  { kw: "lanche", cmd: "lanche" },
  { kw: "dormi", cmd: "dormi" },
  { kw: "acordei", cmd: "acordei" },
  { kw: "exercicio", cmd: "exercicio" },
  { kw: "games", cmd: "games" },
  { kw: "tempo tela", cmd: "tempo" },
  { kw: "tela", cmd: "tempo" },
  { kw: "procrastinacao", cmd: "procrastinacao" },
  { kw: "ansiedade", cmd: "ansiedade" },
  { kw: "lazer", cmd: "lazer" },
  { kw: "leitura", cmd: "leitura" },
];

function fuzzyParseCommand(text) {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const { kw, cmd } of KEYWORD_MAP) {
    if (lower.includes(kw)) {
      const idx = lower.indexOf(kw);
      const after = lower.slice(idx + kw.length).trim();
      const args = after ? after.split(/\s+/) : [];
      return { raw: `#${cmd}${args.length ? " " + args.join(" ") : ""}`, cmd, args, _fuzzy: true };
    }
  }
  return null;
}
const { transcribeAudio } = require("../services/transcriptionService");
const { appendTaskToSection } = require("../lib/obsidianClient");
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

module.exports = {
  match({ msg, chat }) {
    if (!chat?.isGroup) return false;
    if (REF_BOT && chat.name !== REF_BOT) return false;
    return msg.hasMedia && (msg.type === "audio" || msg.type === "ptt");
  },

  async handle({ msg, chat }) {
    const client = msg.client;
    console.log(`\n[AUDIO HANDLER] Processando audio do grupo: ${chat.name}`);

    const tempDir = os.tmpdir();
    let tempInput = null;
    let tempWav = null;

    try {
      const media = await msg.downloadMedia();
      if (!media) {
        console.error("[AUDIO HANDLER] Mídia não disponível ou expirada.");
        return;
      }

      const ext = media.mimetype.includes("ogg") ? ".ogg" : ".wav";
      tempInput = path.join(tempDir, `audio-${Date.now()}${ext}`);
      tempWav = path.join(tempDir, `audio-${Date.now()}.wav`);

      await fs.writeFile(tempInput, media.data, "base64");
      await convertToWav(tempInput, tempWav);

      console.log("[AUDIO HANDLER] Transcrevendo...");
      const transcription = await transcribeAudio(tempWav);
      console.log("[AUDIO HANDLER] Transcrição:", transcription);

      const trimmed = transcription.trim().toLowerCase();

      if (trimmed.startsWith("tarefa")) {
        const taskText = trimmed.slice(7).trim();
        const dateStr = getLogicalDate(msg.timestamp);
        const result = await appendTaskToSection({ dateStr, taskText });
        console.log("[AUDIO HANDLER] Tarefa adicionada:", taskText);
        saveUndoContext(msg.id?._serialized, {
          metric: "tarefa",
          timestamp: msg.timestamp,
          key: "__tarefa__",
          value: taskText,
        });
      } else {

        let parsed = null;

        // Áudio: apenas "registro" ativa os handlers
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

              break;
            }
          }
        } else {
          console.log("[AUDIO HANDLER] Transcricao nao reconhecida:", trimmed);
        }
      }
    } catch (e) {
      console.error("[AUDIO HANDLER] Erro:", e.message);
    } finally {
      if (tempInput) await fs.remove(tempInput).catch(() => {});
      if (tempWav) await fs.remove(tempWav).catch(() => {});
    }
  },
};
