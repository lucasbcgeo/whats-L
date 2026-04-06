const fs = require("fs-extra");
const path = require("path");
const MessageMedia = require("whatsapp-web.js").MessageMedia;
const { REF_BOT } = require("../config/env");
const { getHandlerForTrigger, isDestinationAllowed, data } = require("../config");
const { resolveSourceAlias, resolveDestinationAlias } = require("../resolvers/aliasResolver");
const vaultResolver = require("../resolvers/vaultResolver");
const contactResolver = require("../resolvers/contactResolver");
const { client } = require("../lib/whatsappClient");

const pendingSelections = new Map();
const SELECTION_TTL = 5 * 60 * 1000;

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function findSimilarContacts(chats, term, maxResults = 5) {
    const cleanTerm = term.replace(/[.,!?;]+$/, "").trim();
    const lower = normalize(cleanTerm);
    return chats
        .filter(c => {
            const cName = normalize(c.name);
            const pushname = normalize(c.contact?.pushname);
            const words = lower.split(/\s+/);
            return words.some(w => w.length >= 3 && (cName.includes(w) || pushname.includes(w)));
        })
        .slice(0, maxResults);
}

function buildCommand(arquivo, destino, fonte) {
    let cmd = `#encaminhar ${arquivo} para: ${destino}`;
    if (fonte) cmd += ` de: ${fonte}`;
    return cmd;
}

function cleanExpired() {
    const now = Date.now();
    for (const [k, v] of pendingSelections) {
        if (now - v.ts > SELECTION_TTL) pendingSelections.delete(k);
    }
}

function parseSelection(body) {
    const normalized = body.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const numberWords = {
        "um": 1, "dois": 2, "duas": 2, "três": 3, "tres": 3, "quatro": 4,
        "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
        "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "quinze": 15,
        "dezasseis": 16, "dezesseis": 16, "dezessete": 17,
        "dezoito": 18, "dezenove": 19, "vinte": 20
    };

    let indices = [];

    // Primeiro: verificar se é digits com ranges (1-4, 1-4,7,8, 1,2,3)
    const digitWithRangePattern = normalized.match(/^[\d,\-\s]+$/);
    if (digitWithRangePattern) {
        const parts = normalized.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        indices.push(i - 1);
                    }
                }
            } else if (trimmed) {
                const num = parseInt(trimmed, 10);
                if (!isNaN(num)) {
                    indices.push(num - 1);
                }
            }
        }
        return indices;
    }

    // Segundo: números por extenso (um dois três)
    const wordParts = normalized.split(/[\s,]+/);
    for (const part of wordParts) {
        if (numberWords[part]) {
            indices.push(numberWords[part] - 1);
        }
    }

    return indices;
}

async function sendFiles(targetChat, results, indices, msg) {
    const validIndices = indices.filter(i => i >= 0 && i < results.length);

    if (validIndices.length === 0) {
        await msg.reply("Números inválidos. Envie novamente.");
        return;
    }

    const invalid = indices.filter(i => i < 0 || i >= results.length);
    if (invalid.length > 0) {
        await msg.reply(`Alguns números são inválidos: ${invalid.map(i => i + 1).join(", ")}`);
        return;
    }

    const chosen = validIndices.map(i => results[i]);
    let sentCount = 0;
    let errors = [];

    for (const file of chosen) {
        try {
            const media = createMediaFromFile(file);
            await targetChat.sendMessage(media, { caption: file.name });
            console.log(`[ENCAMINHAR] Enviado: ${file.name} → ${targetChat.name}`);
            sentCount++;
        } catch (e) {
            console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
            errors.push(file.name);
        } finally {
            if (file._temp) {
                fs.remove(file.path).catch(() => { });
            }
        }
    }

    if (errors.length > 0) {
        await msg.reply(`⚠️ Erro ao enviar: ${errors.join(", ")}`);
    }

    if (sentCount === 1) {
        await msg.reply(`✅ *${chosen[0].name}* enviado para *${targetChat.name}*`);
    } else {
        await msg.reply(`✅ ${sentCount} arquivos enviados para *${targetChat.name}*:\n${chosen.map(f => `• ${f.name}`).join("\n")}`);
    }
}

function parseEncaminhar(text) {
    const raw = (text || "").trim();
    const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const prefixes = ["#encaminhar", "registro encaminhar", "encaminhar"];
    let rest = null;
    for (const p of prefixes) {
        if (lower.startsWith(p)) {
            rest = raw.slice(p.length).trim();
            break;
        }
    }
    if (!rest) return null;

    let arquivo = null, destino = null, fonte = null, data = null, range = null, dataref = "não";

    const parts = rest.split('.');
    const mainPart = parts[0].trim();
    const afterDot = parts.slice(1).join('.').trim();

    if (afterDot) {
        const dataValues = { "hoje": "today", "ontem": "yesterday", "anteontem": "day_before_yesterday", "amanha": "tomorrow", "amanhã": "tomorrow" };

        const dataRangeMatch = afterDot.match(/\s*data\s+(.+?)\s+ate\s+(.+)/i);
        if (dataRangeMatch) {
            const startDate = dataRangeMatch[1].trim();
            const endDate = dataRangeMatch[2].trim();
            data = dataValues[startDate] || startDate;
            range = dataValues[endDate] || endDate;
        } else {
            const dataMatch = afterDot.match(/\s*data\s+(hoje|ontem|anteontem|amanha|amanhã)/i);
            if (dataMatch) {
                data = dataValues[dataMatch[1].toLowerCase()] || dataMatch[1];
            }
        }
    }

    const paraMatch = rest.match(/\s+para\s*[:\-]?\s*/i);
    if (!paraMatch) {
        arquivo = rest.trim();
        if (!arquivo) return null;
        return { arquivo, destino: null, fonte: null, data, range, dataref };
    }

    arquivo = rest.slice(0, paraMatch.index).trim();
    const afterPara = rest.slice(paraMatch.index + paraMatch[0].length);

    const deMatch = afterPara.match(/\s+de\s*[:\-]?\s*/i);
    if (deMatch) {
        destino = afterPara.slice(0, deMatch.index).trim();
        fonte = afterPara.slice(deMatch.index + deMatch[0].length).trim();
    } else {
        destino = afterPara.trim();
    }

    if (!arquivo || !destino) return null;
    return { arquivo, destino, fonte, data, range, dataref };
}

async function findRecipient(client, name) {
    const chats = await client.getChats();

    // Try destination alias first
    const aliasDest = resolveDestinationAlias(name);
    if (aliasDest) {
        const match = chats.find(c => {
            if (aliasDest.type === "group") return c.isGroup && c.name === aliasDest.name;
            if (aliasDest.type === "contact") return !c.isGroup && (c.name || "").toLowerCase().includes(aliasDest.name.toLowerCase());
            return false;
        });
        if (match) return { chat: match, ambiguous: false };
    }

    // Fallback to fuzzy search - remove trailing punctuation for better matching
    const cleanName = name.replace(/[.,!?;]+$/, "").trim();
    const lower = cleanName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const matches = chats.filter(c => {
        const cName = (c.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const pushname = (c.contact?.pushname || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return cName.includes(lower) || pushname.includes(lower);
    });

    if (matches.length === 1) return { chat: matches[0], ambiguous: false };
    if (matches.length > 1) return { chat: null, ambiguous: true, options: matches.slice(0, 5) };

    // No match — find similar contacts for suggestions
    const suggestions = findSimilarContacts(chats, name);
    return { chat: null, ambiguous: false, suggestions };
}

function hasFinancialTable(results) {
    return results.some(r => r.isFinancial);
}

function checkAndAskForDateRef(results, userDataref, arquivo, fonte, targetChat) {
    const isFinancial = hasFinancialTable(results);
    if (!isFinancial) return null;
    const datarefDefault = data.flags?.dataref?.default || "não";
    if (userDataref === "sim" || userDataref === datarefDefault) return null;
    return { isFinancial, arquivo, fonte, targetChat };
}

async function searchFromSource(arquivo, fonte, client, searchOptions = {}) {
    const sourceAlias = fonte ? resolveSourceAlias(fonte) : null;

    // Specific contact source
    if (sourceAlias && sourceAlias.type === "contact") {
        return await contactResolver.resolve(client, sourceAlias.label || fonte, arquivo, searchOptions);
    }

    // Specific vault source
    if (sourceAlias && sourceAlias.type === "vault") {
        return await vaultResolver.resolve(arquivo, sourceAlias.vault || fonte, searchOptions);
    }

    // No alias match — try as direct source filter (backward compat)
    if (fonte && !sourceAlias) {
        const vaultResults = await vaultResolver.resolve(arquivo, fonte, searchOptions);
        if (vaultResults.length > 0) return vaultResults;
        // Try as contact name
        return await contactResolver.resolve(client, fonte, arquivo, searchOptions);
    }

    // No source specified — search all vaults
    const vaultResults = await vaultResolver.resolve(arquivo, null, searchOptions);
    return vaultResults;
}

function createMediaFromFile(file) {
    // For files from contact resolver (temp files with mimetype stored as base64)
    if (file._temp && file.mimetype) {
        const data = fs.readFileSync(file.path, "base64");
        return new MessageMedia(file.mimetype, data, file.name);
    }
    // For vault files (local filesystem paths)
    return MessageMedia.fromFilePath(file.path);
}

async function searchAndSendToChat(client, msg, chat, targetChat, arquivo, fonte, profile, searchOptions = {}) {
    if (profile && !isDestinationAllowed(profile, targetChat, msg.from)) {
        await msg.reply(`❌ Você não tem permissão para encaminhar para *${targetChat.name}*.`);
        return;
    }

    const results = await searchFromSource(arquivo, fonte, client, searchOptions);

    if (results.length === 0) {
        await msg.reply(`Nenhum arquivo encontrado para "*${arquivo}*"${fonte ? ` em ${fonte}` : ""}.`);
        return;
    }

    const datarefNeeded = checkAndAskForDateRef(results, searchOptions.dateRefColumn, arquivo, fonte, targetChat);
    if (datarefNeeded) {
        const sent = await msg.reply(`ℹ️ Este documento vem de uma tabela financeira.\n\nUse *data de entrada* ou *data referência*?\n\n1. Data de entrada (data)\n2. Data referência (data_ref)\n\nResponda com 1 ou 2.`);
        pendingSelections.set(chat.id._serialized || msg.from, {
            type: "dateRefChoice", ts: Date.now(), msgId: sent?.id?._serialized,
            targetChat, results, arquivo, fonte, profile, searchOptions,
        });
        return;
    }

    if (results.length === 1) {
        const file = results[0];
        try {
            const media = createMediaFromFile(file);
            await targetChat.sendMessage(media, { caption: file.name });
            await msg.reply(`✅ *${file.name}* enviado para *${targetChat.name}*`);
        } catch (e) {
            console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
            await msg.reply("❌ Erro ao enviar o arquivo.");
        } finally {
            if (file._temp) fs.remove(file.path).catch(() => { });
        }
        return;
    }

    const list = results.map((r, i) => `${i + 1}. ${r.name} (${r.source})`).join("\n");
    const sent = await msg.reply(`Encontrei ${results.length} arquivos:\n${list}\n\nResponda com o número.`);
    pendingSelections.set(chat.id._serialized || msg.from, {
        type: "file", ts: Date.now(), msgId: sent?.id?._serialized,
        targetChat, results,
    });
}

function parseSelection(body) {
    const normalized = body.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const numberWords = {
        "um": 1, "dois": 2, "duas": 2, "três": 3, "tres": 3, "quatro": 4,
        "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
        "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "quinze": 15,
        "dezasseis": 16, "dezesseis": 16, "dezassete": 17, "dezessete": 17,
        "dezoito": 18, "dezanove": 19, "dezenove": 19, "vinte": 20
    };

    let indices = [];

    // Primeiro: verificar se é digits com ranges (1-4, 1-4,7,8, 1,2,3)
    const digitWithRangePattern = normalized.match(/^[\d,\-\s]+$/);
    if (digitWithRangePattern) {
        const parts = normalized.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
                if (!isNaN(start) && !isNaN(end) && start <= end) {
                    for (let i = start; i <= end; i++) {
                        indices.push(i - 1);
                    }
                }
            } else if (trimmed) {
                const num = parseInt(trimmed, 10);
                if (!isNaN(num)) {
                    indices.push(num - 1);
                }
            }
        }
        return indices;
    }

    // Segundo: números por extenso (um dois três)
    const wordParts = normalized.split(/[\s,]+/);
    for (const part of wordParts) {
        if (numberWords[part]) {
            indices.push(numberWords[part] - 1);
        }
    }

    return indices;
}

async function sendFiles(targetChat, results, indices, msg) {
    const validIndices = indices.filter(i => i >= 0 && i < results.length);

    if (validIndices.length === 0) {
        await msg.reply("Números inválidos. Envie novamente.");
        return;
    }

    const invalid = indices.filter(i => i < 0 || i >= results.length);
    if (invalid.length > 0) {
        await msg.reply(`Alguns números são inválidos: ${invalid.map(i => i + 1).join(", ")}`);
        return;
    }

    const chosen = validIndices.map(i => results[i]);
    let sentCount = 0;
    let errors = [];

    for (const file of chosen) {
        try {
            const media = createMediaFromFile(file);
            await targetChat.sendMessage(media, { caption: file.name });
            console.log(`[ENCAMINHAR] Enviado: ${file.name} → ${targetChat.name}`);
            sentCount++;
        } catch (e) {
            console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
            errors.push(file.name);
        } finally {
            if (file._temp) {
                fs.remove(file.path).catch(() => { });
            }
        }
    }

    if (errors.length > 0) {
        await msg.reply(`⚠️ Erro ao enviar: ${errors.join(", ")}`);
    }

    if (sentCount === 1) {
        await msg.reply(`✅ *${chosen[0].name}* enviado para *${targetChat.name}*`);
    } else {
        await msg.reply(`✅ ${sentCount} arquivos enviados para *${targetChat.name}*:\n${chosen.map(f => `• ${f.name}`).join("\n")}`);
    }
}

async function searchAndSend(client, msg, chat, arquivo, destino, fonte, profile, searchOptions = {}) {
    const recipResult = await findRecipient(client, destino);
    console.log("[ENCAMINHAR] searchAndSend findRecipient:", recipResult.chat?.name || recipResult.ambiguous ? "ambiguous" : "not found");

    if (!recipResult.chat && !recipResult.ambiguous) {
        let msg_text = `Destinatário "*${destino}*" não encontrado.`;
        if (recipResult.suggestions && recipResult.suggestions.length > 0) {
            const sugList = recipResult.suggestions.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
            msg_text += `\n\nVocê quis dizer?\n${sugList}\n\nResponda com o número.`;
            const sent = await msg.reply(msg_text);
            pendingSelections.set(chat.id._serialized || msg.from, {
                type: "destSuggestion", ts: Date.now(), msgId: sent?.id?._serialized,
                suggestions: recipResult.suggestions, arquivo, originalDestino: destino, fonte, profile,
            });
        } else {
            await msg.reply(msg_text);
        }
        return;
    }
    if (recipResult.ambiguous) {
        const list = recipResult.options.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
        await msg.reply(`Mais de um resultado para "*${destino}*":\n${list}\n\nSeja mais específico.`);
        return;
    }

    const targetChat = recipResult.chat;

    if (profile && !isDestinationAllowed(profile, targetChat, msg.from)) {
        await msg.reply(`❌ Você não tem permissão para encaminhar para *${targetChat.name}*.`);
        return;
    }
    const results = await searchFromSource(arquivo, fonte, client, searchOptions);

    if (results.length === 0) {
        await msg.reply(`Nenhum arquivo encontrado para "*${arquivo}*"${fonte ? ` em ${fonte}` : ""}.`);
        return;
    }

    const datarefNeeded = checkAndAskForDateRef(results, searchOptions.dateRefColumn, arquivo, fonte, targetChat);
    if (datarefNeeded) {
        const sent = await msg.reply(`ℹ️ Este documento vem de uma tabela financeira.\n\nUse *data de entrada* ou *data referência*?\n\n1. Data de entrada (data)\n2. Data referência (data_ref)\n\nResponda com 1 ou 2.`);
        pendingSelections.set(chat.id._serialized || msg.from, {
            type: "dateRefChoice", ts: Date.now(), msgId: sent?.id?._serialized,
            targetChat, results, arquivo, fonte, profile, searchOptions,
        });
        return;
    }

    if (results.length === 1) {
        const file = results[0];
        try {
            const media = createMediaFromFile(file);
            await targetChat.sendMessage(media, { caption: file.name });
            await msg.reply(`✅ *${file.name}* enviado para *${targetChat.name}*`);
        } catch (e) {
            console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
            await msg.reply("❌ Erro ao enviar o arquivo.");
        } finally {
            if (file._temp) fs.remove(file.path).catch(() => { });
        }
        return;
    }

    const list = results.map((r, i) => `${i + 1}. ${r.name} (${r.source})`).join("\n");
    const sent = await msg.reply(`Encontrei ${results.length} arquivos:\n${list}\n\nResponda com o número.`);
    pendingSelections.set(chat.id._serialized || msg.from, {
        type: "file", ts: Date.now(), msgId: sent?.id?._serialized,
        targetChat, results,
    });
}

module.exports = {
    match({ msg, parsed, chat }) {
        if (!chat?.isGroup) return false;

        cleanExpired();

        if (parsed && getHandlerForTrigger(parsed.cmd) === "file-forwarder-manual") return true;

        const body = (msg.body || "").trim();
        const lower = body.toLowerCase();

        if (lower.match(/^#encaminhar\s/) || lower.match(/^registro\s+encaminhar\s/) || lower.match(/^encaminhar\s/)) return true;

        if (/^(\d+|(\d+,)+\d+)$/.test(body)) {
            const sel = pendingSelections.get(chat.id._serialized || msg.from);
            if (sel) return true;
        }

        // Also match written numbers (um dois três, um e dois, etc)
        const indices = parseSelection(body);
        if (indices.length > 0) {
            const sel = pendingSelections.get(chat.id._serialized || msg.from);
            if (sel) return true;
        }

        return false;
    },

    async handle({ msg, parsed, chat, profile }) {
        const body = (msg.body || parsed?.raw || "").trim();

        console.log("[ENCAMINHAR] handle() chamado. body:", body, "| via audio:", !!parsed?._fuzzy);
        console.log("[ENCAMINHAR] msg.from:", msg.from, "| msg.body:", JSON.stringify(msg.body));

        // Handle numeric selection from previous search
        const indices = parseSelection(body);
        if (indices.length > 0) {
            const sel = pendingSelections.get(chat.id._serialized || msg.from);
            if (!sel) {
                console.log("[ENCAMINHAR] Seleção numérica recebida mas sem pendência para:", msg.from);
                console.log("[ENCAMINHAR] Pendências ativas:", [...pendingSelections.keys()]);
                await msg.reply("Não há uma seleção pendente. Envie o comando *#encaminhar* novamente.");
                return;
            }

            // File selection (existing flow)
            if (sel.type === "file") {
                await sendFiles(sel.targetChat, sel.results, indices, msg);
                pendingSelections.delete(msg.from);
                return;
            }

            // Destination contact suggestion
            if (sel.type === "destSuggestion") {
                if (indices.length !== 1 || indices[0] < 0 || indices[0] >= sel.suggestions.length) {
                    await msg.reply("Número inválido. Envie novamente.");
                    return;
                }

                const idx = indices[0];
                const chosen = sel.suggestions[idx];
                pendingSelections.delete(chat.id._serialized || msg.from);

                console.log(`[ENCAMINHAR] Destino selecionado: "${chosen.name}" (era "${sel.originalDestino}")`);

                const results = await searchFromSource(sel.arquivo, sel.fonte, client, sel.searchOptions || {});

                if (results.length === 0) {
                    await msg.reply(`Nenhum arquivo encontrado para "*${sel.arquivo}*".`);
                    return;
                }

                const datarefNeeded = checkAndAskForDateRef(results, sel.searchOptions?.dateRefColumn, sel.arquivo, sel.fonte, chosen);
                if (datarefNeeded) {
                    const sent = await msg.reply(`ℹ️ Este documento vem de uma tabela financeira.\n\nUse *data de entrada* ou *data referência*?\n\n1. Data de entrada (data)\n2. Data referência (data_ref)\n\nResponda com 1 ou 2.`);
                    pendingSelections.set(chat.id._serialized || msg.from, {
                        type: "dateRefChoice", ts: Date.now(), msgId: sent?.id?._serialized,
                        targetChat: chosen, results, arquivo: sel.arquivo, fonte: sel.fonte, profile: sel.profile, searchOptions: sel.searchOptions || {},
                    });
                    return;
                }

                if (results.length === 1) {
                    const file = results[0];
                    try {
                        const media = createMediaFromFile(file);
                        await chosen.sendMessage(media, { caption: file.name });
                        await msg.reply(`✅ *${file.name}* enviado para *${chosen.name}*`);
                    } catch (e) {
                        console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
                        await msg.reply("❌ Erro ao enviar o arquivo.");
                    } finally {
                        if (file._temp) fs.remove(file.path).catch(() => { });
                    }
                    return;
                }

                const list = results.map((r, i) => `${i + 1}. ${r.name} (${r.source})`).join("\n");
                const sent = await msg.reply(`Encontrei ${results.length} arquivos:\n${list}\n\nResponda com o número.`);
                pendingSelections.set(chat.id._serialized || msg.from, {
                    type: "file", ts: Date.now(), msgId: sent?.id?._serialized,
                    targetChat: chosen, results,
                });
                return;
            }

            // Source contact suggestion
            if (sel.type === "sourceSuggestion") {
                if (indices.length !== 1 || indices[0] < 0 || indices[0] >= sel.suggestions.length) {
                    await msg.reply("Número inválido. Envie novamente.");
                    return;
                }

                const idx = indices[0];
                const chosenName = sel.suggestions[idx].name;
                pendingSelections.delete(chat.id._serialized || msg.from);

                console.log(`[ENCAMINHAR] Fonte selecionada: "${chosenName}" (era "${sel.originalFonte}")`);
                await searchAndSend(client, msg, chat, sel.arquivo, sel.destino, chosenName, sel.profile, sel.searchOptions);
                return;
            }

            // Date ref choice (financial table detected)
            if (sel.type === "dateRefChoice") {
                if (indices.length !== 1 || (indices[0] !== 0 && indices[0] !== 1)) {
                    await msg.reply("Número inválido. Responda com 1 ou 2.");
                    return;
                }

                const idx = indices[0];
                const useDateRef = (idx === 1);
                const newSearchOptions = { ...sel.searchOptions, dateRefColumn: useDateRef };
                pendingSelections.delete(msg.from);

                console.log(`[ENCAMINHAR] Escolha data: ${useDateRef ? "data_ref" : "data"}`);

                // Re-search with new option
                const newResults = await searchFromSource(sel.arquivo, sel.fonte, client, newSearchOptions);

                if (newResults.length === 0) {
                    await msg.reply(`Nenhum arquivo encontrado com *${useDateRef ? "data referência" : "data de entrada"}*.`);
                    return;
                }

                if (newResults.length === 1) {
                    const chosen = newResults[0];
                    try {
                        const media = createMediaFromFile(chosen);
                        await sel.targetChat.sendMessage(media, { caption: chosen.name });
                        await msg.reply(`✅ *${chosen.name}* enviado para *${sel.targetChat.name}*`);
                    } catch (e) {
                        console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
                        await msg.reply("❌ Erro ao enviar o arquivo.");
                    }
                    return;
                }

                const list = newResults.map((r, i) => `${i + 1}. ${r.name} (${r.source})`).join("\n");
                const sent = await msg.reply(`Encontrei ${newResults.length} arquivos:\n${list}\n\nResponda com o número.`);
                pendingSelections.set(chat.id._serialized || msg.from, {
                    type: "file", ts: Date.now(), msgId: sent?.id?._serialized,
                    targetChat: sel.targetChat, results: newResults,
                });
                return;
            }

            return;
        }

        const cmd = parseEncaminhar(body);
        console.log("[ENCAMINHAR] parseEncaminhar result:", cmd);
        if (!cmd) {
            await msg.reply("Formato: *#encaminhar* arquivo *para:* destino *de:* fonte (de é opcional)");
            return;
        }

        const { arquivo, destino, fonte, data, range, dataref } = cmd;

        const searchOptions = {};
        if (data) searchOptions.dateStart = data;
        if (range) searchOptions.dateEnd = range;
        if (dataref === "sim") searchOptions.dateRefColumn = true;

        console.log(`[ENCAMINHAR] arquivo="${arquivo}" destino="${destino}" fonte="${fonte || 'todas'}" data="${data || 'default'}" range="${range || 'none'}" dataref="${dataref}"`);

        if (!destino) {
            console.log(`[ENCAMINHAR] Sem destino — enviando para o próprio chat: "${chat.name}"`);
            await searchAndSendToChat(client, msg, chat, chat, arquivo, fonte, profile, searchOptions);
            return;
        }

        await searchAndSend(client, msg, chat, arquivo, destino, fonte, profile, searchOptions);
    },
    parseSelection,
    sendFiles,
};
