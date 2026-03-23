const fs = require("fs-extra");
const path = require("path");
const MessageMedia = require("whatsapp-web.js").MessageMedia;
const { REF_BOT } = require("../config/env");
const { resolveSourceAlias, resolveDestinationAlias } = require("../resolvers/aliasResolver");
const vaultResolver = require("../resolvers/vaultResolver");
const contactResolver = require("../resolvers/contactResolver");

const pendingSelections = new Map();
const SELECTION_TTL = 5 * 60 * 1000;

function normalize(str) {
    return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function findSimilarContacts(chats, term, maxResults = 5) {
    const lower = normalize(term);
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

    let arquivo = null, destino = null, fonte = null;

    const paraMatch = rest.match(/\s+para\s*[:\-]?\s*/i);
    if (!paraMatch) return null;

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
    return { arquivo, destino, fonte };
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

    // Fallback to fuzzy search
    const lower = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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

async function searchFromSource(arquivo, fonte, client) {
    const sourceAlias = fonte ? resolveSourceAlias(fonte) : null;

    // Specific contact source
    if (sourceAlias && sourceAlias.type === "contact") {
        return await contactResolver.resolve(client, sourceAlias.label || fonte, arquivo);
    }

    // Specific vault source
    if (sourceAlias && sourceAlias.type === "vault") {
        const filter = sourceAlias.vault || (sourceAlias.path && sourceAlias.path.toLowerCase().includes("lucas") ? "lucas" :
                       sourceAlias.path && sourceAlias.path.toLowerCase().includes("franklin") ? "franklin" : null);
        return await vaultResolver.resolve(arquivo, filter);
    }

    // No alias match — try as direct source filter (backward compat)
    if (fonte && !sourceAlias) {
        const vaultResults = await vaultResolver.resolve(arquivo, fonte);
        if (vaultResults.length > 0) return vaultResults;
        // Try as contact name
        return await contactResolver.resolve(client, fonte, arquivo);
    }

    // No source specified — search all vaults
    const vaultResults = await vaultResolver.resolve(arquivo, null);
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

module.exports = {
    match({ msg, parsed, chat }) {
        if (!chat?.isGroup) return false;
        if (REF_BOT && chat.name !== REF_BOT) return false;

        cleanExpired();

        const body = (msg.body || "").trim();
        const lower = body.toLowerCase();

        if (lower.match(/^#encaminhar\s/) || lower.match(/^registro\s+encaminhar\s/) || lower.match(/^encaminhar\s/)) return true;

        if (/^\d+$/.test(body)) {
            const sel = pendingSelections.get(msg.from);
            if (sel) return true;
        }

        return false;
    },

    async handle({ msg, parsed, chat }) {
        const client = msg.client;
        const body = (msg.body || "").trim();

        // Handle numeric selection from previous search
        if (/^\d+$/.test(body)) {
            const sel = pendingSelections.get(msg.from);
            if (!sel) return;

            const idx = parseInt(body, 10) - 1;

            // File selection (existing flow)
            if (sel.type === "file") {
                if (idx < 0 || idx >= sel.results.length) {
                    await msg.reply("Número inválido. Envie novamente.");
                    return;
                }

                const chosen = sel.results[idx];
                pendingSelections.delete(msg.from);

                try {
                    const media = createMediaFromFile(chosen);
                    await sel.targetChat.sendMessage(media, { caption: chosen.name });
                    console.log(`[ENCAMINHAR] Enviado: ${chosen.name} → ${sel.targetChat.name}`);
                    await msg.reply(`✅ *${chosen.name}* enviado para *${sel.targetChat.name}*`);
                } catch (e) {
                    console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
                    await msg.reply("❌ Erro ao enviar o arquivo.");
                } finally {
                    if (chosen._temp) {
                        fs.remove(chosen.path).catch(() => {});
                    }
                }
                return;
            }

            // Destination contact suggestion
            if (sel.type === "destSuggestion") {
                if (idx < 0 || idx >= sel.suggestions.length) {
                    await msg.reply("Número inválido. Envie novamente.");
                    return;
                }

                const chosenName = sel.suggestions[idx].name;
                pendingSelections.delete(msg.from);

                console.log(`[ENCAMINHAR] Destino selecionado: "${chosenName}" (era "${sel.originalDestino}")`);
                const newCmd = buildCommand(sel.arquivo, chosenName, sel.fonte);
                const fakeMsg = { ...msg, body: newCmd };
                const newParsed = parseEncaminhar(newCmd);
                await module.exports.handle({ msg: fakeMsg, parsed: newParsed, chat });
                return;
            }

            // Source contact suggestion
            if (sel.type === "sourceSuggestion") {
                if (idx < 0 || idx >= sel.suggestions.length) {
                    await msg.reply("Número inválido. Envie novamente.");
                    return;
                }

                const chosenName = sel.suggestions[idx].name;
                pendingSelections.delete(msg.from);

                console.log(`[ENCAMINHAR] Fonte selecionada: "${chosenName}" (era "${sel.originalFonte}")`);
                const newCmd = buildCommand(sel.arquivo, sel.destino, chosenName);
                const fakeMsg = { ...msg, body: newCmd };
                const newParsed = parseEncaminhar(newCmd);
                await module.exports.handle({ msg: fakeMsg, parsed: newParsed, chat });
                return;
            }

            return;
        }

        const cmd = parseEncaminhar(body);
        if (!cmd) {
            await msg.reply("Formato: *#encaminhar* arquivo *para:* destino *de:* fonte (de é opcional)");
            return;
        }

        const { arquivo, destino, fonte } = cmd;
        console.log(`[ENCAMINHAR] arquivo="${arquivo}" destino="${destino}" fonte="${fonte || 'todas'}"`);

        const recipResult = await findRecipient(client, destino);
        if (!recipResult.chat && !recipResult.ambiguous) {
            let msg_text = `Destinatário "*${destino}*" não encontrado.`;
            if (recipResult.suggestions && recipResult.suggestions.length > 0) {
                const sugList = recipResult.suggestions.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
                msg_text += `\n\nVocê quis dizer?\n${sugList}\n\nResponda com o número.`;
                const sent = await msg.reply(msg_text);
                pendingSelections.set(msg.from, {
                    type: "destSuggestion",
                    ts: Date.now(),
                    msgId: sent?.id?._serialized,
                    suggestions: recipResult.suggestions,
                    arquivo,
                    originalDestino: destino,
                    fonte,
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

        const results = await searchFromSource(arquivo, fonte, client);

        if (results.length === 0) {
            let msg_text = `Nenhum arquivo encontrado para "*${arquivo}*"${fonte ? ` em ${fonte}` : ""}.`;
            // If fonte was specified and isn't an alias, suggest similar contacts
            if (fonte && !resolveSourceAlias(fonte)) {
                const chats = await client.getChats();
                const sug = findSimilarContacts(chats, fonte);
                if (sug.length > 0) {
                    const sugList = sug.map((c, i) => `${i + 1}. ${c.name}`).join("\n");
                    msg_text += `\n\nVocê quis dizer alguma dessas fontes?\n${sugList}\n\nResponda com o número.`;
                    const sent = await msg.reply(msg_text);
                    pendingSelections.set(msg.from, {
                        type: "sourceSuggestion",
                        ts: Date.now(),
                        msgId: sent?.id?._serialized,
                        suggestions: sug,
                        arquivo,
                        destino,
                        originalFonte: fonte,
                    });
                    return;
                }
            }
            await msg.reply(msg_text);
            return;
        }

        if (results.length === 1) {
            const file = results[0];
            try {
                const media = createMediaFromFile(file);
                await recipResult.chat.sendMessage(media, { caption: file.name });
                console.log(`[ENCAMINHAR] Enviado: ${file.name} → ${recipResult.chat.name}`);
                await msg.reply(`✅ *${file.name}* enviado para *${recipResult.chat.name}*`);
            } catch (e) {
                console.error("[ENCAMINHAR] Erro ao enviar:", e.message);
                await msg.reply("❌ Erro ao enviar o arquivo.");
            } finally {
                if (file._temp) fs.remove(file.path).catch(() => {});
            }
            return;
        }

        const list = results.map((r, i) => `${i + 1}. ${r.name} (${r.source})`).join("\n");
        const sent = await msg.reply(`Encontrei ${results.length} arquivos:\n${list}\n\nResponda com o número.`);

        pendingSelections.set(msg.from, {
            type: "file",
            ts: Date.now(),
            msgId: sent?.id?._serialized,
            targetChat: recipResult.chat,
            results,
        });
    },
};
