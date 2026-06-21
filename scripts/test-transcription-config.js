const assert = require("assert");

process.env.TRANSCRIPTION_MODEL_PATH = "models/parakeet-test";
const { TRANSCRIPTION_MODEL_PATH } = require("../src/config/env");

assert.strictEqual(TRANSCRIPTION_MODEL_PATH, "models/parakeet-test");
console.log("transcription config ok");
