const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const cacheService = require("../src/services/contactCacheService");

function tempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agenda-cache-"));
    return {
        dir,
        contactsPath: path.join(dir, "contacts.json"),
        allowedPath: path.join(dir, "contacts_allowed.json"),
    };
}

test("findByTerm encontra por nome normalizado em cache existente", () => {
    const env = tempDir();
    fs.writeFileSync(env.contactsPath, JSON.stringify({
        "joao_silva": { "name": "João Silva", "numbers": ["5561999999999@c.us"] }
    }), "utf8");

    const result = cacheService.findByTerm({ filePath: env.contactsPath, term: "joao silva" });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "João Silva");
    assert.deepEqual(result[0].numbers, ["5561999999999@c.us"]);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("findByTerm retorna vazio quando nenhum match", () => {
    const env = tempDir();
    fs.writeFileSync(env.contactsPath, JSON.stringify({
        "joao_silva": { "name": "João Silva", "numbers": ["5561999999999@c.us"] }
    }), "utf8");

    const result = cacheService.findByTerm({ filePath: env.contactsPath, term: "mariazinha" });
    assert.equal(result.length, 0);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("loadCache trata arquivo em branco como cache vazio", () => {
    const env = tempDir();
    fs.writeFileSync(env.contactsPath, "", "utf8");

    const originalError = console.error;
    let errorCalls = 0;
    console.error = () => { errorCalls++; };

    const result = cacheService.loadCache(env.contactsPath);

    console.error = originalError;
    assert.deepEqual(result, {});
    assert.equal(errorCalls, 0);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("ensureCache nao reescreve se arquivo ja existe e tem conteudo", async () => {
    const env = tempDir();
    fs.writeFileSync(env.contactsPath, JSON.stringify({
        "joao_silva": { "name": "João Silva", "numbers": ["5561999999999@c.us"] }
    }), "utf8");

    const fakeClient = { getChats: async () => { throw new Error("nao deveria chamar"); } };
    await cacheService.ensureCache({ filePath: env.contactsPath, client: fakeClient });

    const data = JSON.parse(fs.readFileSync(env.contactsPath, "utf8"));
    assert.equal(Object.keys(data).length, 1);
    assert.equal(data.joao_silva.name, "João Silva");

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("ensureCache sincroniza do client quando arquivo vazio", async () => {
    const env = tempDir();
    const fakeClient = {
        getChats: async () => [
            { isGroup: false, name: "Maria Souza", contact: {}, id: { _serialized: "5561888888888@c.us" } },
            { isGroup: true, name: " Grupo X", id: { _serialized: "group@g.us" } },
        ],
    };

    await cacheService.ensureCache({ filePath: env.contactsPath, client: fakeClient });

    const data = JSON.parse(fs.readFileSync(env.contactsPath, "utf8"));
    assert.ok(data.maria_souza, "deve ter criado chave maria_souza");
    assert.equal(data.maria_souza.name, "Maria Souza");
    assert.deepEqual(data.maria_souza.numbers, ["5561888888888@c.us"]);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("ensureCache inclui contatos com id lid", async () => {
    const env = tempDir();
    const fakeClient = {
        getChats: async () => [
            { isGroup: false, name: "Sarah Campos", id: { _serialized: "123456789@lid" } },
        ],
    };

    await cacheService.ensureCache({ filePath: env.contactsPath, client: fakeClient });

    const data = JSON.parse(fs.readFileSync(env.contactsPath, "utf8"));
    assert.ok(data.sarah_campos, "deve ter criado chave sarah_campos");
    assert.equal(data.sarah_campos.name, "Sarah Campos");
    assert.deepEqual(data.sarah_campos.numbers, ["123456789@lid"]);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("ensureCache nao duplica mesmo id com nomes diferentes", async () => {
    const env = tempDir();
    const fakeClient = {
        getChats: async () => [
            { isGroup: false, name: "Sarah Campos", id: { _serialized: "123456789@lid" } },
            { isGroup: false, name: "Sarah Campos.", id: { _serialized: "123456789@lid" } },
        ],
    };

    await cacheService.ensureCache({ filePath: env.contactsPath, client: fakeClient });

    const data = JSON.parse(fs.readFileSync(env.contactsPath, "utf8"));
    assert.equal(Object.keys(data).length, 1);
    assert.ok(data.sarah_campos);
    assert.deepEqual(data.sarah_campos.numbers, ["123456789@lid"]);

    fs.rmSync(env.dir, { recursive: true, force: true });
});

test("resync throttle: duas chamadas em menos de 60s usam throttle", async () => {
    const env = tempDir();
    let calls = 0;
    const fakeClient = {
        getChats: async () => {
            calls++;
            return [{ isGroup: false, name: "Pedro", id: { _serialized: "556111@c.us" } }];
        },
    };

    await cacheService.resync({ filePath: env.contactsPath, client: fakeClient });
    await cacheService.resync({ filePath: env.contactsPath, client: fakeClient });

    assert.equal(calls, 1, "segunda chamada deveria estar em throttle");

    fs.rmSync(env.dir, { recursive: true, force: true });
});
