const { exec } = require("child_process");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");
const { WHISPER_MODEL, WHISPER_GPU_THRESHOLD_SECONDS, TRANSCRIPTION_ENGINE } = require("../config/env");

const PYTHON = "C:/Users/Avell/miniconda3/Scripts/conda.exe";
const PYTHON_ARGS = ["run", "-p", "G:/Projetos/whats-L/venv"];
const TRANSCRIBE_SCRIPT = path.join(__dirname, "..", "..", "scripts", "transcribe.py");
const FFPROBE = "ffprobe";

const GPU_THRESHOLD = parseInt(WHISPER_GPU_THRESHOLD_SECONDS) || 60;
const ENGINE = TRANSCRIPTION_ENGINE || "parakeet";

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
  const modelName = WHISPER_MODEL || "medium";

  const duration = await getAudioDuration(audioPath);
  const useGpu = true; // Always use GPU for faster processing
  
  const deviceParam = useGpu ? "cuda" : "cpu";
  const deviceLabel = useGpu ? "GPU" : "CPU";

  return new Promise((resolve, reject) => {
    const cmd = `"${PYTHON}" ${PYTHON_ARGS.join(" ")} python "${TRANSCRIBE_SCRIPT}" "${audioPath}" ${modelName} ${deviceParam}`;
    console.log(`[TRANSCRIPTION] ${deviceLabel} (${duration.toFixed(1)}s): ${modelName}`);

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
