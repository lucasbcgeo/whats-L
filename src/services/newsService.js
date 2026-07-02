const { execFile } = require("child_process");
const path = require("path");

const PYTHON = path.join(__dirname, "..", "..", "venv", "Scripts", "python.exe");
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "fetch_news.py");
const TIMEOUT = 60000; // 60s

const LABELS = {
    tecnologia: "💻 Tecnologia",
    ciencia: "🔬 Ciência",
    politica: "🏛️ Política",
    cultura: "🎓 Cultura",
    concursos: "📝 Concursos"
};

function fetchNews(maxPerCategory = 3) {
    return new Promise((resolve, reject) => {
        const args = [SCRIPT, "--max-per-category", String(maxPerCategory)];

        execFile(PYTHON, args, { timeout: TIMEOUT, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error("[NEWS] Python error:", error.message);
                if (stderr) console.error("[NEWS] stderr:", stderr);
                return reject(error);
            }

            try {
                if (stderr) console.log("[NEWS] stderr:", stderr);
                const news = JSON.parse(stdout.trim());
                resolve(news);
            } catch (e) {
                console.error("[NEWS] Parse error:", e.message);
                reject(e);
            }
        });
    });
}

function formatNews(news) {
    if (!news || typeof news !== "object" || Array.isArray(news)) {
        console.error("[NEWS] Invalid news data:", typeof news);
        return "";
    }

    const lines = [];
    const seenTitles = new Set();  // Deduplicar no Node também

    for (const [category, items] of Object.entries(news)) {
        if (!items || items.length === 0) continue;

        const label = LABELS[category] || category;
        const categoryLines = [];

        for (const item of items) {
            const titleNormalized = (item.titulo || "").toLowerCase().trim();
            if (seenTitles.has(titleNormalized)) continue;
            seenTitles.add(titleNormalized);

            const link = item.url ? ` ${item.url}` : "";
            categoryLines.push(`• ${item.titulo}${link}`);
        }

        if (categoryLines.length > 0) {
            lines.push(`\n${label}`);
            lines.push(...categoryLines);
        }
    }

    return lines.join("\n");
}

module.exports = { fetchNews, formatNews };
