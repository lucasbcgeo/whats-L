const fs = require("fs");
const path = require("path");
const { VAULT, DAILY_FOLDER, OBSIDIAN_REST_API_URL, OBSIDIAN_REST_API_KEY } = require("../config/env");
const { fetchNews, formatNews } = require("./newsService");

const STATE_FILE = path.join(__dirname, "..", "..", "data", "daily_digest_state.json");
const DELAY_MS = 60000;

function todayLocal(offset = -3) {
    const now = new Date(Date.now() + offset * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

function writeState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function alreadyRanToday() { return readState().lastRun === todayLocal(); }
function markRan() { writeState({ lastRun: todayLocal(), sent: true }); }

// --- Auth key helper ---

function getAuthKey() {
    const raw = OBSIDIAN_REST_API_KEY || "";
    return raw.startsWith("Bearer ") ? raw.slice(7) : raw;
}

// --- Obsidian REST API ---

async function obsidianGet(endpoint) {
    const res = await fetch(`${OBSIDIAN_REST_API_URL}${endpoint}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${getAuthKey()}` },
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Obsidian API ${res.status}`);
    return res;
}

async function obsidianPost(endpoint, body) {
    const res = await fetch(`${OBSIDIAN_REST_API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${getAuthKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Obsidian API ${res.status}`);
    return res;
}

async function readNote(notePath) {
    const encoded = encodeURIComponent(notePath);
    const res = await obsidianGet(`/vault/${encoded}`);
    return await res.text();
}

async function searchTasks() {
    // search/simple with query param returns {0: {filename, matches[]}, ...}
    const q = encodeURIComponent("- [ ]");
    const res = await obsidianPost(`/search/simple/?query=${q}`, {});
    const data = await res.json();
    return Object.values(data); // [{filename, matches: [{context, ...}]}]
}

// --- Filesystem fallback ---

function readNoteFs(vaultRelPath) {
    if (!VAULT) throw new Error("VAULT not set");
    return fs.readFileSync(path.join(VAULT, vaultRelPath), "utf8");
}

function searchTasksFs() {
    if (!VAULT) return [];
    const base = DAILY_FOLDER || "01_Arquivos/Jornada";
    const results = [];
    for (let i = 0; i < 90; i++) {
        const d = new Date(Date.now() + (-3) * 3600000 - i * 86400000);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const rel = `${base}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
        try {
            const content = readNoteFs(rel);
            if (content.includes("- [ ]")) {
                results.push({ filename: rel, context: content });
            }
        } catch {}
    }
    return results;
}

// --- Task parsing ---

function parseOverdueTasks(searchResults, today) {
    const seen = new Set();
    const tasks = [];

    for (const result of searchResults) {
        const filename = result.filename || "";

        let text = "";
        if (result.context) {
            text = result.context;
        } else if (result.matches) {
            text = result.matches.map(m => m.context || "").join("\n");
        }

        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.match(/^- \[ \]/)) continue;

            const dueMatch = line.match(/⏳\s*(\d{4}-\d{2}-\d{2})/);
            const schedMatch = line.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
            const taskDate = dueMatch?.[1] || schedMatch?.[1];
            if (!taskDate || taskDate >= today) continue;

            const rawText = line.replace(/^- \[ \]\s+/, "").split(/(?=[📅⏳🔁])/)[0].trim();
            const cleanText = rawText.replace(/\*\*/g, "").replace(/\s*#[\w-]+/g, "").trim();

            const [y, m, d] = taskDate.split("-");
            const dedupKey = `${filename}|${cleanText}|${taskDate}`;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);

            // Collect subtasks (indented lines starting with `  - [ ]`)
            const subtasks = [];
            for (let j = i + 1; j < lines.length; j++) {
                const sub = lines[j];
                if (sub.match(/^\s{2,}- \[ \]/)) {
                    const subText = sub.replace(/^\s+- \[ \]\s+/, "").replace(/[📅⏳🔁#].*/g, "").replace(/\*\*/g, "").trim();
                    if (subText) subtasks.push(subText);
                } else if (sub.match(/^- \[ \]/)) {
                    break; // next parent task
                } else if (sub.trim() && !sub.match(/^\s/)) {
                    break; // non-indented content, stop
                }
            }

            tasks.push({
                text: cleanText,
                subtasks,
                due: dueMatch?.[1] || null,
                scheduled: schedMatch?.[1] || null,
                dateLabel: `${d}/${m}`,
                source: filename
            });
        }
    }

    return tasks;
}
                dateLabel: `${d}/${m}`,
                source: filename
            });
        }
    }

    return tasks;
}

// --- Commitments (filesystem fallback) ---

function collectCommitmentsFs(today) {
    if (!VAULT) return [];
    const base = DAILY_FOLDER || "01_Arquivos/Jornada";
    const todayDate = new Date(today + "T12:00:00Z");
    const dayOfWeek = todayDate.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setUTCDate(todayDate.getUTCDate() - daysFromMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    const commitments = [];
    for (let d = new Date(weekStart); d <= weekEnd; d = new Date(d.getTime() + 86400000)) {
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const rel = `${base}/${yyyy}/${mm}/${yyyy}-${mm}-${dd}.md`;
        try {
            const content = readNoteFs(rel);
            for (const line of content.split("\n")) {
                if ((line.includes("#eventos") || (line.includes("📅") && line.includes("- ["))) && line.includes("📅")) {
                    const dateMatch = line.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
                    const date = dateMatch?.[1];
                    if (date && date < today) continue;
                    const titleMatch = line.match(/^- \[[ x]\]\s+(.+)/);
                    const title = titleMatch ? titleMatch[1].replace(/[📅⏳🔁#].*/g, "").trim() : rel;
                    commitments.push({ title, date, source: rel });
                }
            }
        } catch {}
    }
    return commitments;
}

// --- Main logic ---

async function collectTodayTasks() {
    const today = todayLocal();
    const [yyyy, mm, dd] = today.split("-");
    const notePath = `${DAILY_FOLDER || "01_Arquivos/Jornada"}/${yyyy}/${mm}/${today}.md`;
    try {
        let content;
        try { content = await readNote(notePath); } catch { content = readNoteFs(notePath); }
        const tasks = [];
        for (const line of content.split("\n")) {
            if (!line.match(/^- \[ \]/)) continue;
            const text = line.replace(/^- \[ \]\s+/, "").replace(/[📅⏳🔁#].*/g, "").trim();
            tasks.push({ text });
        }
        return tasks;
    } catch (e) {
        console.error("[DIGEST] todayTasks error:", e.message);
        return [];
    }
}

async function collectOverdueTasks() {
    const today = todayLocal();
    let results;
    try {
        results = await searchTasks();
        console.log("[DIGEST] REST API results:", results.length);
    } catch (e) {
        console.log("[DIGEST] REST API failed, using filesystem:", e.message);
        results = searchTasksFs();
        console.log("[DIGEST] Filesystem results:", results.length);
    }
    return parseOverdueTasks(results, today);
}

async function collectWeeklyCommitments() {
    const today = todayLocal();
    const todayDate = new Date(today + "T12:00:00Z");
    const dayOfWeek = todayDate.getUTCDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setUTCDate(todayDate.getUTCDate() - daysFromMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

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
        const res = await obsidianPost("/search/", logic);
        const data = await res.json();
        const entries = Object.values(data);
        const commitments = [];
        for (const entry of entries) {
            const text = entry.matches?.map(m => m.context || "").join("\n") || "";
            const dateMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
            const date = dateMatch?.[1];
            if (date && date < today) continue;
            const titleMatch = text.match(/^- \[[ x]\]\s+(.+)/);
            const title = titleMatch ? titleMatch[1].replace(/[📅⏳🔁#].*/g, "").trim() : entry.filename;
            commitments.push({ title, date, source: entry.filename });
        }
        return commitments;
    } catch (e) {
        console.log("[DIGEST] Commitments API failed, using filesystem:", e.message);
        return collectCommitmentsFs(today);
    }
}

function formatDigest(todayTasks, overdueTasks, commitments, news) {
    const today = todayLocal();
    const [, mm, dd] = today.split("-");
    const dateFormatted = `${dd}/${mm}`;
    const lines = [];

    lines.push(`📋 TAREFAS DO DIA (${dateFormatted})`);
    if (todayTasks.length === 0) {
        lines.push("• Nenhuma tarefa para hoje");
    } else {
        for (const task of todayTasks) lines.push(`• [ ] ${task.text}`);
    }

    if (overdueTasks.length > 0) {
        lines.push("");
        lines.push("⚠️ TAREFAS ATRASADAS");
        for (const task of overdueTasks) {
            lines.push(`• [ ] ${task.text} (${task.dateLabel})`);
            for (const sub of task.subtasks || []) {
                lines.push(`  • [ ] ${sub}`);
            }
        }
    }

    if (commitments.length > 0) {
        lines.push("");
        lines.push("📅 COMPROMISSOS DA SEMANA");
        for (const c of commitments) {
            if (c.date) {
                const dateObj = new Date(c.date + "T12:00:00Z");
                const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
                const [y, m, d] = c.date.split("-");
                lines.push(`• ${c.title} (${d}/${m} - ${dayNames[dateObj.getUTCDay()]})`);
            } else {
                lines.push(`• ${c.title}`);
            }
        }
    }

    const newsSection = formatNews(news);
    if (newsSection) {
        lines.push("");
        lines.push("📰 NOTÍCIAS (últimas 24h)");
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
    if (alreadyRanToday()) { console.log("[DIGEST] Já executou hoje."); return; }

    console.log("[DIGEST] Iniciando coleta...");
    const [todayTasks, overdueTasks, commitments, news] = await Promise.all([
        collectTodayTasks().catch(e => { console.error("[DIGEST] today:", e.message); return []; }),
        collectOverdueTasks().catch(e => { console.error("[DIGEST] overdue:", e.message); return []; }),
        collectWeeklyCommitments().catch(e => { console.error("[DIGEST] commitments:", e.message); return []; }),
        fetchNews(3).catch(e => { console.error("[DIGEST] news:", e.message); return {}; })
    ]);

    console.log("[DIGEST] Result:", {
        todayTasks: todayTasks.length,
        overdueTasks: overdueTasks.length,
        commitments: commitments.length
    });

    const message = formatDigest(todayTasks, overdueTasks, commitments, news);
    const group = await findGroup(client, "minime");
    if (!group) { console.error("[DIGEST] Grupo Minime não encontrado"); return; }

    await group.sendMessage(message);
    markRan();
    console.log("[DIGEST] Enviado.");
}

function startDailyDigest(client) {
    setTimeout(() => {
        runDigest(client).catch(e => console.error("[DIGEST] Erro:", e.message));
    }, DELAY_MS);
}

module.exports = { startDailyDigest, runDigest };
