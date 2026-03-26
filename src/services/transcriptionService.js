const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { WHISPER_MODEL_PATH } = require("../config/env");

const PYTHON = path.join(__dirname, "..", "..", "venv", "Scripts", "python.exe");

async function transcribeAudio(audioPath) {
  const modelPath = WHISPER_MODEL_PATH || "medium";
  const outputDir = os.tmpdir();
  const baseName = path.basename(audioPath, ".wav");
  const txtPath = path.join(outputDir, `${baseName}.txt`);

  return new Promise((resolve, reject) => {
    const cmd = `"${PYTHON}" -m whisper "${audioPath}" --model ${modelPath} --language pt --initial_prompt "Transcreva em portugues brasileiro. Comandos: cafe, almoco, janta, acordei, dormi, exercicio, games, procrastinacao, ansiedade, lazer, leitura, tarefa, encaminhar." --output_dir "${outputDir}"`;
    console.log(`[TRANSCRIPTION] Executando: ${modelPath}`);

    const child = exec(cmd, {
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 110000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    }, async (error, stdout, stderr) => {
      try {
        if (await fs.pathExists(txtPath)) {
          const text = (await fs.readFile(txtPath, "utf8")).trim();
          await fs.remove(txtPath);
          resolve(text);
        } else if (error) {
          if (error.killed) {
            reject(new Error("Transcription timeout (110s)"));
          } else {
            reject(new Error(`Transcription failed: ${error.message}`));
          }
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
