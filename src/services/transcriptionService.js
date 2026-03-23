const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { WHISPER_MODEL_PATH } = require("../config/env");
const logger = require("../utils/logger");

async function transcribeAudio(audioPath, modelSize = "base") {
  const modelPath = WHISPER_MODEL_PATH || modelSize;
  
  const tempOutput = path.join(os.tmpdir(), `whisper-${Date.now()}`);
  const outputDir = os.tmpdir();

  return new Promise((resolve, reject) => {
    const cmd = `python -m whisper "${audioPath}" --model ${modelPath} --language pt --output_dir "${outputDir}" --output_file "${path.basename(tempOutput)}"`;
    logger.info(`[TRANSCRIPTION] Executando: ${cmd}`);

    exec(cmd, { shell: true }, async (error, stdout, stderr) => {
      try {
        const txtPath = `${tempOutput}.txt`;
        if (await fs.pathExists(txtPath)) {
          const text = (await fs.readFile(txtPath, "utf8")).trim();
          await fs.remove(txtPath);
          resolve(text);
        } else if (error) {
          reject(new Error(`Transcription failed: ${error.message}`));
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
