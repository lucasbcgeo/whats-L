const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const alerts = require("../src/services/appointmentAlertService");

test("envia alerta de compromisso Franklin vindo do header watcher state sem duplicar", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appointment-alert-"));
    const sourceFile = path.join(dir, "header_watcher_state.json");
    fs.writeFileSync(sourceFile, JSON.stringify({
        "📅 Próximos Compromissos": "- **Consulta:** 13/07/2026\n- **Outro:** 14/07/2026",
    }), "utf8");

    const sent = [];
    const client = {
        getChats: async () => [
            { isGroup: true, name: "Filhos de Franklin", sendMessage: async (text) => sent.push(text) },
        ],
    };

    const config = {
        labels: {
            groups: {
                filhos_franklin: { groupNames: ["Filhos de Franklin"] },
            },
        },
        appointmentAlerts: {
            groupKey: "filhos_franklin",
            offsets: [15, 7, 3],
            statePath: sourceFile,
        },
    };

    const stateFile = path.join(dir, "sent.json");
    const first = await alerts.sendDueAppointmentAlerts({ client, config, today: "2026-06-28", stateFile });
    const second = await alerts.sendDueAppointmentAlerts({ client, config, today: "2026-06-28", stateFile });

    assert.equal(first, 1);
    assert.equal(second, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /Consulta/);
    assert.match(sent[0], /15 dias/);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("usa PRÉ Resumo Whatsapp como fallback quando state não tem próximos compromissos", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appointment-alert-md-"));
    const statePath = path.join(dir, "header_watcher_state.json");
    const markdownPath = path.join(dir, "PRÉ Resumo Whatsapp.md");
    fs.writeFileSync(statePath, JSON.stringify({ "💰 Finanças": "sem datas" }), "utf8");
    fs.writeFileSync(markdownPath, "### 📅 Próximos Compromissos\n- Retorno médico Franklin em 05/07/2026\n", "utf8");

    const sent = [];
    const client = {
        getChats: async () => [
            { isGroup: true, name: "Filhos de Franklin", sendMessage: async (text) => sent.push(text) },
        ],
    };
    const config = {
        labels: {
            groups: {
                filhos_franklin: { groupNames: ["Filhos de Franklin"] },
            },
        },
        appointmentAlerts: {
            groupKey: "filhos_franklin",
            offsets: [7],
            statePath,
            markdownPath,
        },
    };

    const count = await alerts.sendDueAppointmentAlerts({
        client,
        config,
        today: "2026-06-28",
        stateFile: path.join(dir, "sent.json"),
    });

    assert.equal(count, 1);
    assert.match(sent[0], /Retorno médico Franklin/);
    assert.match(sent[0], /7 dias/);

    fs.rmSync(dir, { recursive: true, force: true });
});

test("não duplica compromisso quando aparece no state e no PRÉ Resumo", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "appointment-alert-dupe-"));
    const statePath = path.join(dir, "header_watcher_state.json");
    const markdownPath = path.join(dir, "PRÉ Resumo Whatsapp.md");
    fs.writeFileSync(statePath, JSON.stringify({
        "📅 Próximos Compromissos": "- Consulta Franklin em 13/07/2026",
    }), "utf8");
    fs.writeFileSync(markdownPath, "### 📅 Próximos Compromissos\n- Consulta Franklin em 13/07/2026\n", "utf8");

    const sent = [];
    const client = {
        getChats: async () => [
            { isGroup: true, name: "Filhos de Franklin", sendMessage: async (text) => sent.push(text) },
        ],
    };
    const config = {
        labels: {
            groups: {
                filhos_franklin: { groupNames: ["Filhos de Franklin"] },
            },
        },
        appointmentAlerts: {
            groupKey: "filhos_franklin",
            offsets: [15],
            statePath,
            markdownPath,
        },
    };

    const count = await alerts.sendDueAppointmentAlerts({
        client,
        config,
        today: "2026-06-28",
        stateFile: path.join(dir, "sent.json"),
    });

    assert.equal(count, 1);
    assert.equal(sent.length, 1);

    fs.rmSync(dir, { recursive: true, force: true });
});
