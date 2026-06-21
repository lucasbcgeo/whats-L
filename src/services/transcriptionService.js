const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { TRANSCRIPTION_MODEL_PATH } = require("../config/env");

const PYTHON = "G:/Projetos/whats-L/venv/python.exe";
const TRANSCRIBE_SCRIPT = path.join(__dirname, "..", "..", "scripts", "transcribe.py");
const FFPROBE = "ffprobe";

async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const cmd = `${FFPROBE} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
    
    exec(cmd, { shell: true }, (error, stdout, stderr) => {
      if (error) {
        resolve(30);
      } else {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 30 : duration);
      }
    });
  });
}

async function transcribeAudio(audioPath) {
  const modelPath = path.resolve(TRANSCRIPTION_MODEL_PATH);

  const duration = await getAudioDuration(audioPath);

  return new Promise((resolve, reject) => {
    const cmd = `"${PYTHON}" "${TRANSCRIBE_SCRIPT}" "${audioPath}" "${modelPath}"`;
    console.log(`[TRANSCRIPTION] Parakeet CPU (${duration.toFixed(1)}s): ${modelPath}`);

    const child = exec(cmd, {
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 110000,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.killed) {
          reject(new Error("Transcription timeout (110s)"));
        } else {
          reject(new Error(`Transcription failed: ${error.message}`));
        }
      } else if (stdout && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error("Transcription failed - no output"));
      }
    });
  });
}

module.exports = { transcribeAudio };
