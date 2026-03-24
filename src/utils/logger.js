const fs = require("fs");
const path = require("path");

const levels = { INFO: 0, WARN: 1, ERROR: 2 };
const currentLevel = levels[process.env.LOG_LEVEL] ?? levels.INFO;
const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

fs.mkdirSync(LOG_DIR, { recursive: true });

function toFile(level, args) {
  const ts = new Date().toISOString();
  const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const line = `[${ts}] [${level}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

function log(level, ...args) {
  if (levels[level] >= currentLevel) {
    const method = level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
    console[method](...args);
    toFile(level, args);
  }
}

function patchConsole() {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    origLog(...args);
    toFile("INFO", args);
  };
  console.error = (...args) => {
    origError(...args);
    toFile("ERROR", args);
  };
  console.warn = (...args) => {
    origWarn(...args);
    toFile("WARN", args);
  };
}

module.exports = {
  INFO: (...args) => log("INFO", ...args),
  WARN: (...args) => log("WARN", ...args),
  ERROR: (...args) => log("ERROR", ...args),
  patchConsole,
};
