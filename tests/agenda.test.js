const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const os = require("os");
const fs = require("fs");

const agenda = require("../src/handlers/agenda");

function makeChat({ isGroup, name }) {
    return { isGroup, name, id: { _serialized: "chat@g.us" } };
}

function makeMsg({ body, from, author, fromMe = false }) {
    return {
        body,
        from,
        author,
        fromMe,
        fromMeString: fromMe ? "true" : "false",
        id: { _serialized: `${from}_${Date.now()}` },
        timestamp: Math.floor(Date.now() / 1000),
        reply: async () => {},
    };
}

function parseAgenda(body) {
    const raw = (body || "").trim();
    if (!raw.startsWith("#")) return null;
    const parts = raw.split(/\s+/);
    const cmd = parts[0].slice(1).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,!?;:]+$/, "");
    return { raw, cmd, args: parts.slice(1) };
}

test("match false para comando que nao agenda", () => {
    const parsed = { cmd: "encaminhar", args: [] };
    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#encaminhar x", from: "group@g.us", author: "556191615552@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), false);
});

test("match true: Lucas em Repete Homi com cmd agenda", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "556191615552@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), true);
});

test("match false: outro numero em Repete Homi", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "55999999999@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), false);
});

test("match true: qualquer membro em Filhos de Franklin", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: true, name: "Filhos de Franklin - Geral" });
    const msg = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "55999999999@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), true);
});

test("match false: Lucas em outro grupo qualquer", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: true, name: "Banco de Dados - Dr. Franklin" });
    const msg = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "556191615552@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), false);
});

test("match true: Sarah DM com Lucas", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: false, name: "Lucas" });
    const msg = makeMsg({ body: "#agenda joao", from: "556181689999@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), true);
});

test("match false: desconhecido DM com Lucas", () => {
    const parsed = parseAgenda("#agenda joao");
    const chat = makeChat({ isGroup: false, name: "Lucas" });
    const msg = makeMsg({ body: "#agenda joao", from: "55999999999@c.us" });
    assert.equal(agenda.match({ msg, parsed, chat }), false);
});

test("selectScope retorna full quando admin em Repete Homi", () => {
    assert.equal(agenda.selectScope({
        isGroup: true,
        groupName: "Repete se tu for homi",
        senderId: "556191615552@c.us",
    }), "full");
});

test("selectScope retorna allowed quando membro em Filhos de Franklin", () => {
    assert.equal(agenda.selectScope({
        isGroup: true,
        groupName: "Filhos de Franklin - Geral",
        senderId: "55999999999@c.us",
    }), "allowed");
});

test("selectScope retorna allowed quando Sarah DM", () => {
    assert.equal(agenda.selectScope({
        isGroup: false,
        groupName: null,
        senderId: "556181689999@c.us",
    }), "allowed");
});