const audioHandler = require("./audio-handler");
const encaminhar = require("./encaminhar");
const ansiedade = require("./ansiedade");
const alimentacao = require("./alimentacao");
const exercicio = require("./exercicio");
const games = require("./games");
const leitura = require("./leitura");
const sono = require("./sono");
const tempoTela = require("./tempo-tela");
const procrastinacao = require("./procrastinacao");
const lazer = require("./lazer");
const fileForwarder = require("./file-forwarder");
const headerSync = require("./header-sync");

module.exports = [
    audioHandler,
    encaminhar,
    sono,
    alimentacao,
    exercicio,
    games,
    tempoTela,
    procrastinacao,
    lazer,
    ansiedade,
    leitura,
    fileForwarder,
    headerSync,
];
