const { data, getAllTriggers } = require("../config");
const { parseDateWord } = require("../utils/dateParser");

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

function extractDateFromArgs(args, timestamp) {
  const dateWords = ["hoje", "ontem", "anteontem", "amanha", "amanhã"];
  const remaining = [];
  let dateFlag = null;

  // Tenta detectar data em palavras avulsas
  for (let i = 0; i < args.length; i++) {
    const norm = args[i].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (dateWords.includes(norm)) {
      const parsed = parseDateWord(args[i], timestamp);
      if (parsed) {
        dateFlag = `--data:${parsed}`;
        continue;
      }
    }
    // Tenta "DD de mes" ou "DD de mes de AAAA" como sequência de args
    if (/^\d{1,2}$/.test(args[i]) && i + 2 < args.length && args[i + 1]?.toLowerCase() === "de") {
      const monthPart = args.slice(i + 2).join(" ").replace(/\s+de\s+\d{4}$/, (m) => m);
      const candidate = `${args[i]} de ${monthPart}`;
      const parsed = parseDateWord(candidate, timestamp);
      if (parsed) {
        dateFlag = `--data:${parsed}`;
        // Pula os args consumidos
        let skip = 2; // DD + "de"
        while (i + skip < args.length && args[i + skip] !== args[i + skip + 1]) skip++;
        i += skip;
        continue;
      }
    }
    remaining.push(args[i]);
  }

  if (dateFlag) remaining.push(dateFlag);
  return { args: remaining, dateFlag };
}
const { transcribeAudio } = require("../services/transcriptionService");
const { parseCommand, extractFlagsFromAudio } = require("../utils/parse");
const { time } = require("../services/obsidianService");
const { getHandlerMetricName, saveUndoContext } = require("../services/undoService");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { exec } = require("child_process");

const FFMPEG = path.join(__dirname, "..", "..", "tools", "ffmpeg.exe");

async function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(`"${FFMPEG}" -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`, { windowsHide: true }, (err) => {
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

  async handle({ msg, chat, profile }) {
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

      // Extrai datas dos args ("hoje", "ontem", "28 de agosto")
      if (parsed && parsed.args.length > 0) {
        const extracted = extractDateFromArgs(parsed.args, msg.timestamp);
        if (extracted.dateFlag) {
          parsed.args = extracted.args;
          console.log("[AUDIO HANDLER] Data extraída:", extracted.dateFlag);
        }
      }
      
      // Extrai flags do final do áudio (ex: "data hoje" ou "data-hoje" ou ". data hoje")
      const audioFlags = extractFlagsFromAudio(transcription);
      console.log("[AUDIO HANDLER] Transcription:", transcription);
      console.log("[AUDIO HANDLER] Parsed before flags:", JSON.stringify(parsed));
      if (Object.keys(audioFlags).length > 0) {
        console.log("[AUDIO HANDLER] Flags extraídas do áudio:", audioFlags);
        parsed.args = parsed.args || [];
        for (const [key, value] of Object.entries(audioFlags)) {
          parsed.args.push(`--${key}:${value}`);
        }
      }

      if (parsed) {
        const { getProfileHandlers } = require("../main");
        const profileHandlers = getProfileHandlers(profile);
        
        console.log("[AUDIO HANDLER] profile:", profile);
        console.log("[AUDIO HANDLER] profileHandlers:", profileHandlers.map(h => h.name));
        
        for (const { name, handler: h } of profileHandlers) {
          if (h !== module.exports && h.match({ msg, parsed, chat })) {
            console.log("[AUDIO HANDLER] Handler matched:", name);
            try {
              const result = await h.handle({ msg, parsed, chat, profile });
              console.log("[AUDIO HANDLER] Handler executado:", name, "result:", result);
              return;
            } catch (handlerErr) {
              console.error("[AUDIO HANDLER] Erro no handler delegado:", handlerErr.message);
              try { await msg.reply("Erro ao executar o comando do áudio."); } catch {}
            }
            break;
          }
        }
        console.log("[AUDIO HANDLER] Nenhum handler matched para o comando");
      } else {
        console.log("[AUDIO HANDLER] Transcricao nao reconhecida:", trimmed);
        const allTriggers = getAllTriggers().join(", ");
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
