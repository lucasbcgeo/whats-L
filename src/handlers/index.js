const audioHandler = require("./audio-handler");
const fileForwarderManual = require("./file-forwarder-manual");
const sleep = require("./sleep");
const food = require("./food");
const exercise = require("./exercise");
const games = require("./games");
const screenTime = require("./screen-time");
const procrastination = require("./procrastination");
const leisure = require("./leisure");
const anxiety = require("./anxiety");
const reading = require("./reading");
const fileForwarderAuto = require("./file-forwarder-auto");
const task = require("./task");

const handlers = [
    { name: "audioHandler", handler: audioHandler },
    { name: "fileForwarderManual", handler: fileForwarderManual },
    { name: "sleep", handler: sleep },
    { name: "food", handler: food },
    { name: "exercise", handler: exercise },
    { name: "games", handler: games },
    { name: "screenTime", handler: screenTime },
    { name: "procrastination", handler: procrastination },
    { name: "leisure", handler: leisure },
    { name: "anxiety", handler: anxiety },
    { name: "reading", handler: reading },
    { name: "fileForwarderAuto", handler: fileForwarderAuto },
    { name: "task", handler: task },
];

module.exports = handlers;
