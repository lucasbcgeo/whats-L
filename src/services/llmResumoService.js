const fs = require("fs-extra");
const { OLLAMA_API_KEY, OLLAMA_MODEL } = require("../config/env");

const PRE_PATH = "G:/Franklin/Outros/Guias/PRÉ Resumo Whatsapp.md";
const RESUMO_PATH = "G:/Franklin/Outros/Guias/Resumo WhatsApp.md";
const MAX_PRE_LINES = 20;

const SYSTEM_PROMPT = `Você é um assistente que atualiza um resumo de WhatsApp para uso familiar.

Regras:
1. Recebe as mensagens recentes (PRÉ) e o resumo atual
2. Atualiza o resumo incorporando informações novas das mensagens
3. Remove informações desatualizadas (compromissos já passados, status antigos)
4. Mantém o formato com seções ### (ex: ### 💰 Finanças, ### 💊 Situação Médica, ### 📅 Próximos Compromissos)
5. Não inventa informações — usa apenas o que está nas mensagens
6. Responde APENAS com o conteúdo markdown atualizado, sem explicações ou comentários`;

function readFileSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return "";
        return fs.readFileSync(filePath, "utf8").trim();
    } catch { return ""; }
}

function buildMessages(preContent, resumoContent) {
    let userContent = "";

    if (resumoContent) {
        userContent += `## Resumo atual:\n\n${resumoContent}\n\n`;
    }

    userContent += `## Mensagens recentes (PRÉ):\n\n${preContent}\n\n`;

    userContent += `Atualize o resumo acima com as informações das mensagens recentes. Remova o que estiver desatualizado.`;

    return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
    ];
}

async function callOllama(messages) {
    if (!OLLAMA_API_KEY) {
        throw new Error("OLLAMA_API_KEY não configurada no .env");
    }

    const { Ollama } = require("ollama");
    const ollama = new Ollama({
        host: "https://ollama.com",
        headers: {
            Authorization: `Bearer ${OLLAMA_API_KEY}`,
        },
    });

    console.log(`[LLM RESUMO] Chamando Ollama Cloud (${OLLAMA_MODEL})...`);
    const response = await ollama.chat({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
    });

    return response.message.content;
}

function cleanPreFile() {
    try {
        const content = readFileSafe(PRE_PATH);
        if (!content) return;

        const lines = content.split("\n");
        if (lines.length <= MAX_PRE_LINES) return;

        const header = lines.find(l => l.startsWith("# ")) || "# PRÉ Resumo WhatsApp";
        const recentLines = lines.slice(-MAX_PRE_LINES);

        const newContent = `${header}\n\n${recentLines.join("\n")}\n`;
        fs.writeFileSync(PRE_PATH, newContent, "utf8");
        console.log(`[LLM RESUMO] PRÉ limpo: ${lines.length} → ${recentLines.length} linhas`);
    } catch (e) {
        console.error("[LLM RESUMO] Erro ao limpar PRÉ:", e.message);
    }
}

async function processar() {
    const preContent = readFileSafe(PRE_PATH);
    const resumoContent = readFileSafe(RESUMO_PATH);

    if (!preContent) {
        return { success: false, message: "Nada para processar — PRÉ vazio." };
    }

    console.log(`[LLM RESUMO] PRÉ: ${preContent.split("\n").length} linhas | Resumo: ${resumoContent.split("\n").length} linhas`);

    const messages = buildMessages(preContent, resumoContent);
    const result = await callOllama(messages);

    if (!result || !result.trim()) {
        return { success: false, message: "LLM retornou resposta vazia." };
    }

    await fs.ensureDir(require("path").dirname(RESUMO_PATH));
    fs.writeFileSync(RESUMO_PATH, result.trim() + "\n", "utf8");
    console.log("[LLM RESUMO] Resumo atualizado.");

    cleanPreFile();

    return { success: true, message: "Resumo atualizado com sucesso." };
}

module.exports = { processar };
