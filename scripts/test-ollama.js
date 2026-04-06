require('dotenv').config({ override: true });

const fs = require("fs-extra");

const PRE_PATH = "G:/Franklin/Outros/Guias/PRÉ Resumo Whatsapp teste.md";
const RESUMO_PATH = "G:/Franklin/Outros/Guias/Resumo WhatsApp teste.md";

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
    const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
    const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b";

    if (!OLLAMA_API_KEY) {
        throw new Error("OLLAMA_API_KEY não configurada no .env");
    }

    const { Ollama } = require("ollama");
    const client = new Ollama({
        host: "https://ollama.com",
        headers: {
            Authorization: "Bearer " + OLLAMA_API_KEY,
        },
    });

    console.log(`[TESTE] Chamando Ollama Cloud (${OLLAMA_MODEL})...`);
    const response = await client.chat({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
    });

    return response.message.content;
}

async function testar() {
    const preContent = readFileSafe(PRE_PATH);
    const resumoContent = readFileSafe(RESUMO_PATH);

    if (!preContent) {
        console.log("[TESTE] PRÉ vazio - nada para testar");
        return;
    }

    console.log(`[TESTE] PRÉ: ${preContent.split("\n").length} linhas | Resumo: ${resumoContent.split("\n").length} linhas`);

    const messages = buildMessages(preContent, resumoContent);
    const result = await callOllama(messages);

    console.log("\n=== RESPOSTA DO OLLAMA ===\n");
    console.log(result);
    console.log("\n=== FIM ===\n");
}

testar().catch(console.error);
