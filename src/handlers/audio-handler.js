const { AUDIO_SOURCE_NUMBERS } = require("../config/env");
const { transcribeAudio } = require("../services/transcriptionService");
const { appendTaskToSection } = require("../lib/obsidianClient");
const { parseCommand } = require("../utils/parse");
const { time } = require("../services/obsidianService");
const { getLogicalDate } = time;
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");

async function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16l "${outputPath}"`, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  match({ msg }) {
    if (!AUDIO_SOURCE_NUMBERS?.length) return false;
    if (!AUDIO_SOURCE_NUMBERS.includes(msg.from)) return false;
    return msg.hasMedia && msg.type === "audio";
  },

  async handle({ msg }) {
    const client = msg.client;
    console.log(`\n[AUDIO HANDLER] Processando áudio de: ${msg.from}`);

    try {
      const media = await msg.downloadMedia();
      if (!media) {
        console.error("[AUDIO HANDLER] Mídia não disponível ou expirada.");
        return;
      }

      const tempDir = os.tmpdir();
      const ext = media.mimetype.includes("ogg") ? ".ogg" : ".wav";
      const tempInput = path.join(tempDir, `audio-${Date.now()}${ext}`);
      const tempWav = path.join(tempDir, `audio-${Date.now()}.wav`);

      await fs.writeFile(tempInput, media.data, "base64");
      await convertToWav(tempInput, tempWav);

      console.log("[AUDIO HANDLER] Transcrevendo...");
      const transcription = await transcribeAudio(tempWav);
      console.log("[AUDIO HANDLER] Transcrição:", transcription);

      await fs.remove(tempInput);
      await fs.remove(tempWav);

      const trimmed = transcription.trim().toLowerCase();
      
      if (trimmed.startsWith("tarefa")) {
        const taskText = trimmed.slice(7).trim();
        const dateStr = getLogicalDate(msg.timestamp);
        await appendTaskToSection({ dateStr, taskText });
        console.log("[AUDIO HANDLER] Tarefa adicionada:", taskText);
      } else {
        console.log("[AUDIO HANDLER] Passando para handlers existentes:", transcription);
        const parsed = parseCommand("#" + transcription);
        if (parsed) {
          for (const h of require("./index.js")) {
            if (h !== module.exports && h.match({ msg, parsed })) {
              await h.handle({ msg, parsed });
              console.log("[AUDIO HANDLER] Handler executado:", h.constructor?.name || "handler");
              break;
            }
          }
        } else {
          console.log("[AUDIO HANDLER] Transcrição não reconhecida como comando");
        }
      }
    } catch (e) {
      console.error("[AUDIO HANDLER] Erro:", e.message);
    }
  },
};
