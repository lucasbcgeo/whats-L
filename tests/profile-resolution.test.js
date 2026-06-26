const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../src/config");

test("perfil com contato e grupo exige ambos", () => {
    assert.equal(config.resolveProfile({
        groupName: "Grupo sem autorização",
        number: "556191615552@c.us",
    }), null);
});

test("autor LID do grupo é convertido para o telefone configurado", async () => {
    assert.equal(typeof config.resolveMessageProfile, "function");

    const profile = await config.resolveMessageProfile({
        groupName: "Filhos de Franklin - Geral",
        number: "220572457906328@lid",
    }, {
        getContactLidAndPhone: async () => [{ pn: "556191615552@c.us" }],
    });

    assert.equal(profile, "sarah-lucas");
});

test("Lucas pode encaminhar no grupo Banco Franklin", () => {
    assert.equal(config.resolveProfile({
        groupName: "Banco de Dados - Dr. Franklin",
        number: "556191615552@c.us",
    }), "sarah-lucas");
});

test("LID real de Lucas autoriza o grupo Filhos de Franklin sem depender da conversão", () => {
    assert.equal(config.resolveProfile({
        groupName: "Filhos de Franklin - Geral",
        number: "220572457906328@lid",
    }), "sarah-lucas");
});

test("resolução tenta o LID original quando o telefone convertido não corresponde", async () => {
    const profile = await config.resolveMessageProfile({
        groupName: "Filhos de Franklin - Geral",
        number: "220572457906328@lid",
    }, {
        getContactLidAndPhone: async () => [{ pn: "telefone-inesperado@c.us" }],
    });

    assert.equal(profile, "sarah-lucas");
});

test("seleciona o participante correto para mensagens recebidas e enviadas em grupo", () => {
    assert.equal(typeof config.getMessageSenderId, "function");
    assert.equal(config.getMessageSenderId({
        fromMe: true,
        author: "120363426537743980@g.us",
        from: "220572457906328@lid",
    }, true), "220572457906328@lid");
    assert.equal(config.getMessageSenderId({
        fromMe: false,
        author: "233118090977488@lid",
        from: "120363426537743980@g.us",
    }, true), "233118090977488@lid");
});
