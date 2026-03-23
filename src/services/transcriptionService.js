const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { WHISPER_MODEL_PATH } = require("../config/env");
const logger = require("../utils/logger");

function findWhisperBinary() {
  const candidates = [
    "whisper-cli.exe",
    path.join(os.homedir(), "whisper.cpp", "build", "bin", "release", "whisper-cli.exe"),
    "C:\\whisper.cpp\\build\\bin\\release\\whisper-cli.exe",
  ];
  for (const c of candidates) {
    if (c) return c;
  }
  return "whisper-cli.exe";
}

async function transcribeAudio(audioPath, modelPath = WHISPER_MODEL_PATH) {
  const modelFullPath = path.isAbsolute(modelPath) 
    ? modelPath 
    : path.join(process.cwd(), modelPath);

  if (!await fs.pathExists(modelFullPath)) {
    throw new Error(`Modelo whisper não encontrado em: ${modelFullPath}. Baixe de: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`);
  }

  const whisperBin = findWhisperBinary();
  const tempOutput = path.join(os.tmpdir(), `whisper-${Date.now()}`);

  return new Promise((resolve, reject) => {
    const cmd = `${whisperBin} -m "${modelFullPath}" -f "${audioPath}" -otxt -o "${tempOutput}"`;
    logger.info(`[TRANSCRIPTION] Executando: ${cmd}`);

    exec(cmd, { shell: true }, async (error, stdout, stderr) => {
      try {
        const txtPath = `${tempOutput}.txt`;
        if (await fs.pathExists(txtPath)) {
          const text = (await fs.readFile(txtPath, "utf8")).trim();
          await fs.remove(txtPath);
          resolve(text);
        } else if (stderr) {
          resolve(stderr.trim());
        } else {
          reject(new Error("Transcription failed - no output file"));
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { transcribeAudio };
