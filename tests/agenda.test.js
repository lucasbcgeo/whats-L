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

const cacheService = require("../src/services/contactCacheService");

function makeTempContactsFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenda-hand-"));
    const filePath = path.join(dir, "contacts.json");
    const allowedPath = path.join(dir, "contacts_allowed.json");
    fs.writeFileSync(filePath, JSON.stringify({
        "joao_silva": { "name": "João Silva", "numbers": ["5561999999999@c.us"] },
        "joao_pedro": { "name": "João Pedro", "numbers": ["5561888888888@c.us"] },
        "maria_souza": { "name": "Maria Souza", "numbers": ["5561777777777@c.us"] },
    }), "utf8");
    fs.writeFileSync(allowedPath, JSON.stringify({
        "maria_souza": { "name": "Maria Souza", "numbers": ["5561777777777@c.us"] },
    }), "utf8");
    return { dir, filePath, allowedPath };
}

test("handle envia um unico match por DM", async () => {
    const env = makeTempContactsFile();
    const captured = [];
    const sentContacts = [];
    const contact = { id: { _serialized: "5561777777777@c.us" }, name: "Maria Souza" };
    const fakeClient = {
        getContactById: async (id) => {
            assert.equal(id, "5561777777777@c.us");
            return contact;
        },
        sendMessage: async (id, content) => {
            sentContacts.push({ id, content });
        },
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Filhos de Franklin - Geral" });
    const msg = makeMsg({ body: "#agenda maria", from: "group@g.us", author: "55999999999@c.us" });
    const parsed = parseAgenda("#agenda maria");

    await agenda.handle({ msg, parsed, chat });

    assert.equal(captured.length, 0);
    assert.equal(sentContacts.length, 1);
    assert.equal(sentContacts[0].id, "55999999999@c.us");
    assert.equal(sentContacts[0].content, contact);

    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("handle lista numerada quando multiplos match", async () => {
    const env = makeTempContactsFile();
    const captured = [];
    const fakeClient = {
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "556191615552@c.us" });
    const parsed = parseAgenda("#agenda joao");

    await agenda.handle({ msg, parsed, chat });

    assert.equal(captured.length, 1);
    assert.ok(captured[0].text.includes("1."));
    assert.ok(captured[0].text.includes("João Silva"));
    assert.ok(captured[0].text.includes("João Pedro"));
    assert.ok(/Responda com o número/i.test(captured[0].text));

    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("handle sem termo envia help por DM", async () => {
    const env = makeTempContactsFile();
    const captured = [];
    const fakeClient = {
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#agenda ", from: "group@g.us", author: "556191615552@c.us" });
    const parsed = parseAgenda("#agenda ");

    await agenda.handle({ msg, parsed, chat });

    assert.equal(captured.length, 1);
    assert.ok(/Uso:/i.test(captured[0].text));

    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("selecao numerica entrega contato por DM", async () => {
    const env = makeTempContactsFile();
    const captured = [];
    const fakeClient = {
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg1 = makeMsg({ body: "#agenda joao", from: "group@g.us", author: "556191615552@c.us" });
    const parsed1 = parseAgenda("#agenda joao");
    await agenda.handle({ msg: msg1, parsed: parsed1, chat });

    captured.length = 0;
    const selMsg = makeMsg({ body: "2", from: "556191615552@c.us" });
    await agenda.handle({ msg: selMsg, parsed: null, chat: { isGroup: false, name: "Lucas" } });

    assert.equal(captured.length, 1);
    assert.ok(captured[0].text.includes("João Pedro"));
    assert.equal(captured[0].id, "556191615552@c.us");

    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("handle nao encontrado dispara resync uma vez", async () => {
    const env = makeTempContactsFile();
    let resyncCalls = 0;
    const originalResync = cacheService.resync;
    cacheService.resync = async (opts) => {
        resyncCalls++;
        fs.writeFileSync(opts.filePath, JSON.stringify({
            "xico_menezes": { "name": "Xico Menezes", "numbers": ["55611111@c.us"] },
        }), "utf8");
        return {};
    };

    const captured = [];
    const fakeClient = {
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Repete se tu for homi" });
    const msg = makeMsg({ body: "#agenda xico", from: "group@g.us", author: "556191615552@c.us" });
    const parsed = parseAgenda("#agenda xico");
    await agenda.handle({ msg, parsed, chat });

    assert.equal(resyncCalls, 1);
    assert.ok(captured.length >= 1);
    assert.ok(captured[captured.length - 1].text.includes("Xico Menezes"));

    cacheService.resync = originalResync;
    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("handle allowed vazio nao sincroniza lista manual", async () => {
    const env = makeTempContactsFile();
    fs.writeFileSync(env.allowedPath, "{}", "utf8");

    let getChatsCalls = 0;
    const captured = [];
    const fakeClient = {
        getChats: async () => {
            getChatsCalls++;
            throw new Error("nao deveria sincronizar allowed");
        },
        getChatById: async (id) => ({
            id: { _serialized: id },
            sendMessage: async (text) => { captured.push({ id, text }); },
        }),
    };
    agenda._setClientForTest(fakeClient);
    agenda._setCachePathsForTest(env.filePath, env.allowedPath);

    const chat = makeChat({ isGroup: true, name: "Filhos de Franklin - Geral" });
    const msg = makeMsg({ body: "#agenda xico", from: "group@g.us", author: "55999999999@c.us" });
    const parsed = parseAgenda("#agenda xico");
    await agenda.handle({ msg, parsed, chat });

    assert.equal(getChatsCalls, 0);
    assert.equal(captured.length, 1);
    assert.ok(/não encontrado/i.test(captured[0].text));

    agenda._resetForTest();
    fs.rmSync(env.dir, { recursive: true, force: true });
});
