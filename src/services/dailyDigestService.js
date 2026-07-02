const fs = require("fs");
const path = require("path");
const { VAULT, DAILY_FOLDER, OBSIDIAN_REST_API_URL, OBSIDIAN_REST_API_KEY } = require("../config/env");
const { fetchNews, formatNews } = require("./newsService");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "daily_digest_state.json");
const DELAY_MS = 30000; // 30s delay after startup

function todayLocal(offset = -3) {
    const now = new Date(Date.now() + offset * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return {};
    }
}

function writeState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function alreadyRanToday() {
    const state = readState();
    return state.lastRun === todayLocal();
}

function markRan() {
    writeState({ lastRun: todayLocal(), sent: true });
}

// --- Obsidian REST API helpers ---

async function obsidianFetch(endpoint, options = {}) {
    const url = `${OBSIDIAN_REST_API_URL}${endpoint}`;
    const headers = {
        "Authorization": `Bearer ${OBSIDIAN_REST_API_KEY}`,
        ...options.headers
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
        throw new Error(`Obsidian API ${response.status}: ${response.statusText}`);
    }
    return response;
}

async function readNote(notePath) {
    const encoded = encodeURIComponent(notePath);
    const res = await obsidianFetch(`/vault/${encoded}`);
    return await res.text();
}

async function searchSimple(query) {
    const res = await obsidianFetch("/search/simple/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
    });
    return await res.json();
}

async function searchJsonLogic(logic) {
    const res = await obsidianFetch("/search/", {
        method: "POST",
        headers: { "Content-Type": "application/vnd.olrapi.jsonlogic+json" },
        body: JSON.stringify(logic)
    });
    return await res.json();
}

// --- Task parsing ---

function parseTasksFromMarkdown(content) {
    const tasks = [];
    const lines = content.split("\n");

    for (const line of lines) {
        const match = line.match(/^- \[ \]\s+(.+)/);
        if (!match) continue;

        const text = match[1].trim();
        const dueMatch = text.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
        const scheduledMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);

        tasks.push({
            text: text.replace(/[📅⏳🔁#].*/g, "").trim(),
            due: dueMatch ? dueMatch[1] : null,
            scheduled: scheduledMatch ? scheduledMatch[1] : null
        });
    }

    return tasks;
}

// --- Main logic ---

async function collectTodayTasks() {
    const today = todayLocal();
    const [yyyy, mm, dd] = today.split("-");
    const notePath = `${DAILY_FOLDER || "01_Arquivos/Jornada"}/${yyyy}/${mm}/${today}.md`;

    try {
        const content = await readNote(notePath);
        return parseTasksFromMarkdown(content);
    } catch (e) {
        console.error("[DIGEST] Erro ao ler nota diária:", e.message);
        return [];
    }
}

async function collectOverdueTasks() {
    const today = todayLocal();

    try {
        const results = await searchSimple("- [ ]");
        const tasks = [];

        for (const result of results || []) {
            const content = result.content || "";
            const parsed = parseTasksFromMarkdown(content);

            for (const task of parsed) {
                const taskDate = task.due || task.scheduled;
                if (taskDate && taskDate < today) {
                    tasks.push({ ...task, source: result.path });
                }
            }
        }

        return tasks;
    } catch (e) {
        console.error("[DIGEST] Erro ao buscar tarefas atrasadas:", e.message);
        return [];
    }
}

async function collectWeeklyCommitments() {
    const today = todayLocal();
    const todayDate = new Date(today + "T12:00:00Z");
    const dayOfWeek = todayDate.getUTCDay(); // 0=dom, 1=seg, ..., 6=sab

    // Calcular início e fim da semana
    const weekStart = new Date(todayDate);
    weekStart.setUTCDate(todayDate.getUTCDate() - dayOfWeek + 1); // segunda
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6); // domingo

    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    try {
        const logic = {
            "and": [
                { "in": ["#eventos", { "var": "tags" }] },
                { ">=": [{ "var": "date" }, weekStartStr] },
                { "<=": [{ "var": "date" }, weekEndStr] }
            ]
        };

        const results = await searchJsonLogic(logic);
        const commitments = [];

        for (const result of results || []) {
            const dateMatch = result.content?.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch ? dateMatch[1] : null;

            // Lógica: se compromisso é antes de hoje, não enviar
            if (date && date < today) continue;

            // Extrair título do compromisso
            const titleMatch = result.content?.match(/^- \[[ x]\]\s+(.+)/);
            const title = titleMatch ? titleMatch[1].replace(/[📅⏳🔁#].*/g, "").trim() : result.path;

            commitments.push({ title, date, source: result.path });
        }

        return commitments;
    } catch (e) {
        console.error("[DIGEST] Erro ao buscar compromissos:", e.message);
        return [];
    }
}

function formatDigest(todayTasks, overdueTasks, commitments, news) {
    const today = todayLocal();
    const [yyyy, mm, dd] = today.split("-");
    const dateFormatted = `${dd}/${mm}`;

    const lines = [];

    // Tarefas do dia
    lines.push(`📋 TAREFAS DO DIA (${dateFormatted})`);
    if (todayTasks.length === 0) {
        lines.push("• Nenhuma tarefa para hoje");
    } else {
        for (const task of todayTasks) {
            lines.push(`• [ ] ${task.text}`);
        }
    }

    // Tarefas atrasadas
    if (overdueTasks.length > 0) {
        lines.push("");
        lines.push("⚠️ TAREFAS ATRASADAS");
        for (const task of overdueTasks) {
            const dueStr = task.due || task.scheduled || "???";
            const [y, m, d] = dueStr.split("-");
            lines.push(`• [ ] ${task.text} (${d}/${m})`);
        }
    }

    // Compromissos da semana
    if (commitments.length > 0) {
        lines.push("");
        lines.push("📅 COMPROMISSOS DA SEMANA");
        for (const c of commitments) {
            if (c.date) {
                const [y, m, d] = c.date.split("-");
                const dateObj = new Date(c.date + "T12:00:00Z");
                const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
                const dayName = dayNames[dateObj.getUTCDay()];
                lines.push(`• ${c.title} (${d}/${m} - ${dayName})`);
            } else {
                lines.push(`• ${c.title}`);
            }
        }
    }

    // Notícias
    const newsSection = formatNews(news);
    if (newsSection) {
        lines.push("");
        lines.push(`📰 NOTÍCIAS (últimas 24h)`);
        lines.push(newsSection);
    }

    return lines.join("\n");
}

async function findGroup(client, groupKey) {
    const { data } = require("../config");
    const groupNames = data.labels?.groups?.[groupKey]?.groupNames || [];
    const chats = await client.getChats();
    return chats.find(chat => chat.isGroup && groupNames.includes(chat.name)) || null;
}

async function runDigest(client) {
    if (alreadyRanToday()) {
        console.log("[DIGEST] Já executou hoje, pulando.");
        return;
    }

    console.log("[DIGEST] Iniciando coleta de dados...");

    const [todayTasks, overdueTasks, commitments, news] = await Promise.all([
        collectTodayTasks().catch(e => { console.error("[DIGEST] todayTasks error:", e.message); return []; }),
        collectOverdueTasks().catch(e => { console.error("[DIGEST] overdueTasks error:", e.message); return []; }),
        collectWeeklyCommitments().catch(e => { console.error("[DIGEST] commitments error:", e.message); return []; }),
        fetchNews(3).catch(e => { console.error("[DIGEST] news error:", e.message); return {}; })
    ]);

    const message = formatDigest(todayTasks, overdueTasks, commitments, news);

    const group = await findGroup(client, "minime");
    if (!group) {
        console.error("[DIGEST] Grupo Minime não encontrado");
        return;
    }

    await group.sendMessage(message);
    markRan();
    console.log("[DIGEST] Resumo diário enviado para Minime.");
}

function startDailyDigest(client) {
    setTimeout(() => {
        runDigest(client).catch(e => {
            console.error("[DIGEST] Erro ao executar digest:", e.message);
        });
    }, DELAY_MS);
}

module.exports = { startDailyDigest, runDigest };
