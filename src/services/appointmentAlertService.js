const fs = require("fs");
const path = require("path");
const { data } = require("../config");

const DEFAULT_STATE_FILE = path.join(__dirname, "..", "..", "data", "appointment_alerts_sent.json");
const DEFAULT_HEADER_STATE = path.join(__dirname, "..", "..", "data", "header_watcher_state.json");
const DEFAULT_PRE_RESUMO = "G:/Franklin/99_Sistema/_ia/PRÉ Resumo Whatsapp.md";

function daysUntil(fromDate, toDate) {
    const from = Date.parse(`${fromDate}T00:00:00Z`);
    const to = Date.parse(`${toDate}T00:00:00Z`);
    return Math.round((to - from) / 86400000);
}

function readState(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return {};
    }
}

function writeState(file, state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

function todayLocal(offset = -3) {
    const now = new Date(Date.now() + offset * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

function normalize(text) {
    return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getGroupNames(config, groupKey) {
    return config.labels?.groups?.[groupKey]?.groupNames || [];
}

async function findGroup(client, names) {
    const chats = await client.getChats();
    return chats.find(chat => chat.isGroup && names.includes(chat.name)) || null;
}

function formatAlert(appointment, days) {
    return `Compromisso de Franklin em ${days} dias: ${appointment.title} (${appointment.date})`;
}

function sectionFromState(filePath) {
    const state = readState(filePath);
    const key = Object.keys(state).find(k => normalize(k).includes("proximos compromissos"));
    return key ? state[key] : "";
}

function sectionFromMarkdown(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return "";
    const content = fs.readFileSync(filePath, "utf8");
    const parts = content.split(/^###\s+/m);
    for (let i = 1; i < parts.length; i++) {
        const lines = parts[i].split(/\r?\n/);
        const title = lines[0].trim();
        if (normalize(title).includes("proximos compromissos")) {
            return lines.slice(1).join("\n").trim();
        }
    }
    return "";
}

function parseDate(text) {
    const dmy = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
    if (!dmy) return null;
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function stripMarkdown(text) {
    return text
        .replace(/^[\s*-]+/, "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function appointmentsFromSection(section) {
    return (section || "")
        .split(/\r?\n/)
        .map(stripMarkdown)
        .filter(Boolean)
        .map(line => ({ title: line.replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/, "").replace(/[:;,-]\s*$/, "").trim(), date: parseDate(line) }))
        .filter(appt => appt.date && appt.title);
}

function loadAppointments(config) {
    const cfg = config.appointmentAlerts || {};
    const stateSection = sectionFromState(cfg.statePath || DEFAULT_HEADER_STATE);
    const section = stateSection || sectionFromMarkdown(cfg.markdownPath || DEFAULT_PRE_RESUMO);
    return appointmentsFromSection(section);
}

async function sendDueAppointmentAlerts({ client, config = data, today = todayLocal(), stateFile = DEFAULT_STATE_FILE } = {}) {
    const cfg = config.appointmentAlerts;
    if (!cfg?.groupKey) return 0;

    const offsets = cfg.offsets || [15, 7, 3];
    const due = loadAppointments(config).filter(appt => offsets.includes(daysUntil(today, appt.date)));
    if (due.length === 0) return 0;

    const group = await findGroup(client, getGroupNames(config, cfg.groupKey));
    if (!group) return 0;

    const state = readState(stateFile);
    let sent = 0;
    for (const appointment of due) {
        const days = daysUntil(today, appointment.date);
        const key = `${appointment.id || appointment.title}:${appointment.date}:${days}`;
        if (state[key]) continue;

        await group.sendMessage(formatAlert(appointment, days));
        state[key] = today;
        sent++;
    }
    if (sent > 0) writeState(stateFile, state);
    return sent;
}

async function startAppointmentAlerts(client) {
    try {
        const sent = await sendDueAppointmentAlerts({ client });
        if (sent > 0) console.log(`[APPOINTMENT ALERT] ${sent} alerta(s) enviado(s).`);
    } catch (e) {
        console.error("[APPOINTMENT ALERT] erro:", e.message);
    }
}

module.exports = {
    daysUntil,
    loadAppointments,
    sendDueAppointmentAlerts,
    startAppointmentAlerts,
};
