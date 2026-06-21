const http = require("http");
const fs = require("fs");
const path = require("path");
const { MessageMedia } = require("whatsapp-web.js");

const log = (...args) => console.log("[OUTBOUND]", ...args);
const logErr = (...args) => console.error("[OUTBOUND]", ...args);

let server = null;
let chatsCache = { ts: 0, value: null };
const CHATS_TTL_MS = 60_000;
const MAX_INLINE_PAYLOAD = 25 * 1024 * 1024;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "video/", "application/pdf", "application/octet-stream", "text/", "application/msword", "application/vnd.openxmlformats-officedocument", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/zip", "application/x-rar-compressed"];

function isAllowedMime(mime) {
  if (!mime) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function detectMimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".aac": "audio/aac",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".mov": "video/quicktime",
    ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
    ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip", ".rar": "application/x-rar-compressed", ".7z": "application/x-7z-compressed",
  };
  return map[ext] || "application/octet-stream";
}

function readBody(req, maxBytes = MAX_INLINE_PAYLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D+/g, "");
  if (!/^\d{6,15}$/.test(digits)) return null;
  return `${digits}@c.us`;
}

function isChatId(value) {
  return typeof value === "string" && /^\d+@(c\.us|g\.us|lid)$/.test(value);
}

async function getCachedChats(client) {
  const now = Date.now();
  if (chatsCache.value && now - chatsCache.ts < CHATS_TTL_MS) {
    return chatsCache.value;
  }
  const chats = await client.getChats();
  chatsCache = { ts: now, value: chats };
  return chats;
}

function clearChatsCache() {
  chatsCache = { ts: 0, value: null };
}

async function resolveChat(client, to) {
  if (isChatId(to)) {
    return { chat: null, resolvedAs: to, direct: true };
  }

  const phoneChatId = normalizePhone(to);
  if (phoneChatId) {
    try {
      let registeredId = null;
      try {
        registeredId = await client.getNumberId(phoneChatId.replace(/@c\.us$/, ""));
      } catch (e) {
        logErr(`getNumberId(${phoneChatId}) falhou:`, e.message);
      }
      const id = registeredId?._serialized || phoneChatId;
      return { chat: null, resolvedAs: id, direct: true };
    } catch (e) {
      logErr(`normalizePhone(${phoneChatId}) falhou:`, e.message);
    }
  }

  const chats = await getCachedChats(client);
  const target = String(to).trim().toLowerCase();
  const match = chats.find((c) => {
    const name = (c.name || "").trim().toLowerCase();
    if (!name) return false;
    return name === target || name.includes(target);
  });
  if (match) return { chat: match, resolvedAs: match.id._serialized, direct: false };

  return null;
}

async function handleSend(client, body) {
  if (!body || typeof body !== "object") {
    return { status: 400, payload: { ok: false, error: "invalid_body" } };
  }
  const to = body.to;
  if (typeof to !== "string" || to.trim() === "") {
    return { status: 400, payload: { ok: false, error: "missing_to" } };
  }

  const hasFile = body.file !== undefined && body.file !== null;
  const hasText = typeof body.text === "string" && body.text.trim() !== "";

  if (!hasFile && !hasText) {
    return { status: 400, payload: { ok: false, error: "missing_text_or_file" } };
  }

  if (hasText && !hasFile && body.text.length > 65536) {
    return { status: 413, payload: { ok: false, error: "text_too_long" } };
  }

  clearChatsCache();
  const resolved = await resolveChat(client, to);
  if (!resolved) {
    return {
      status: 404,
      payload: { ok: false, error: "chat_not_found", to },
    };
  }

  if (hasFile) {
    return await sendFile(client, resolved, body.file, body.caption || "");
  }
  return await sendText(client, resolved, body.text);
}

async function sendText(client, resolved, text) {
  try {
    let sent;
    if (resolved.direct) {
      sent = await client.sendMessage(resolved.resolvedAs, text);
    } else {
      sent = await resolved.chat.sendMessage(text);
    }
    return {
      status: 200,
      payload: {
        ok: true,
        messageId: sent.id?._serialized,
        to: resolved.resolvedAs,
        name: resolved.chat?.name || null,
        kind: "text",
      },
    };
  } catch (e) {
    logErr("sendText falhou:", e?.stack || e);
    return {
      status: 502,
      payload: { ok: false, error: "send_failed", detail: e?.message || String(e) },
    };
  }
}

async function sendFile(client, resolved, fileSpec, caption) {
  let media;
  let sourceLabel;
  try {
    if (typeof fileSpec === "string") {
      fileSpec = { path: fileSpec };
    }
    if (!fileSpec || typeof fileSpec !== "object") {
      return { status: 400, payload: { ok: false, error: "invalid_file_spec" } };
    }

    if (fileSpec.path) {
      const filePath = path.resolve(fileSpec.path);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          return { status: 400, payload: { ok: false, error: "not_a_file", path: filePath } };
        }
        if (stat.size > MAX_FILE_SIZE) {
          return { status: 413, payload: { ok: false, error: "file_too_large", size: stat.size, max: MAX_FILE_SIZE } };
        }
      } catch (e) {
        return { status: 404, payload: { ok: false, error: "file_not_found", path: filePath, detail: e.message } };
      }
      const mime = fileSpec.mimetype || detectMimeFromExt(filePath);
      if (!isAllowedMime(mime)) {
        return { status: 415, payload: { ok: false, error: "unsupported_media_type", mimetype: mime } };
      }
      media = MessageMedia.fromFilePath(filePath, mime);
      sourceLabel = path.basename(filePath);
    } else if (fileSpec.data) {
      const mime = fileSpec.mimetype || "application/octet-stream";
      if (!isAllowedMime(mime)) {
        return { status: 415, payload: { ok: false, error: "unsupported_media_type", mimetype: mime } };
      }
      media = new MessageMedia(mime, fileSpec.data, fileSpec.filename || "file");
      sourceLabel = fileSpec.filename || "inline";
    } else {
      return { status: 400, payload: { ok: false, error: "invalid_file_spec", detail: "expected path or data" } };
    }

    const options = caption ? { caption } : {};
    let sent;
    if (resolved.direct) {
      sent = await client.sendMessage(resolved.resolvedAs, media, options);
    } else {
      sent = await resolved.chat.sendMessage(media, options);
    }
    return {
      status: 200,
      payload: {
        ok: true,
        messageId: sent.id?._serialized,
        to: resolved.resolvedAs,
        name: resolved.chat?.name || null,
        kind: "file",
        filename: sourceLabel,
        mimetype: media.mimetype,
      },
    };
  } catch (e) {
    logErr("sendFile falhou:", e?.stack || e);
    return {
      status: 502,
      payload: { ok: false, error: "send_failed", detail: e?.message || String(e) },
    };
  }
}

async function handleList(client, kind) {
  try {
    const chats = await getCachedChats(client);
    if (kind === "groups") {
      const groups = chats
        .filter((c) => c.isGroup)
        .map((c) => ({
          id: c.id._serialized,
          name: c.name,
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return { status: 200, payload: { ok: true, count: groups.length, groups } };
    }
    const recent = chats
      .slice()
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 20)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name,
        isGroup: c.isGroup,
        timestamp: c.timestamp || 0,
      }));
    return { status: 200, payload: { ok: true, count: recent.length, chats: recent } };
  } catch (e) {
    logErr("list falhou:", e?.stack || e);
    return {
      status: 502,
      payload: { ok: false, error: "list_failed", detail: e?.message || String(e) },
    };
  }
}

async function handleHealth() {
  return { status: 200, payload: { ok: true, service: "whats-L-outbound" } };
}

function startServer(client) {
  const port = Number(process.env.WHATS_OUTBOUND_PORT || 5454);
  const token = process.env.WHATS_OUTBOUND_TOKEN;

  if (!token) {
    logErr("WHATS_OUTBOUND_TOKEN ausente. Bridge não vai subir.");
    return null;
  }
  if (server) {
    log("server já ativo.");
    return server;
  }

  server = http.createServer(async (req, res) => {
    const method = req.method || "GET";
    const url = (req.url || "/").split("?")[0];

    res.setHeader("Connection", "close");

    if (method === "GET" && url === "/health") {
      const result = await handleHealth();
      return sendJson(res, result.status, result.payload);
    }

    const authHeader = req.headers["x-whats-token"];
    if (!token || authHeader !== token) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }

    try {
      if (method === "POST" && url === "/send") {
        const raw = await readBody(req);
        let body;
        try {
          body = raw.length ? JSON.parse(raw.toString("utf8")) : null;
        } catch {
          return sendJson(res, 400, { ok: false, error: "invalid_json" });
        }
        const result = await handleSend(client, body);
        return sendJson(res, result.status, result.payload);
      }

      if (method === "GET" && url === "/groups") {
        const result = await handleList(client, "groups");
        return sendJson(res, result.status, result.payload);
      }

      if (method === "GET" && url === "/chats") {
        const result = await handleList(client, "chats");
        return sendJson(res, result.status, result.payload);
      }

      return sendJson(res, 404, { ok: false, error: "not_found", path: url });
    } catch (e) {
      logErr("handler erro:", e?.stack || e);
      return sendJson(res, 500, { ok: false, error: "internal", detail: e?.message || String(e) });
    }
  });

  server.on("clientError", (err, socket) => {
    try {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    } catch {}
  });

  server.listen(port, "127.0.0.1", () => {
    log(`bridge escutando em http://127.0.0.1:${port} (token ok)`);
  });

  server.on("error", (e) => {
    logErr("server error:", e?.message || e);
    server = null;
  });

  return server;
}

function stopServer() {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => {
      log("bridge fechada.");
      server = null;
      resolve();
    });
    server = null;
  });
}

module.exports = { startServer, stopServer, clearChatsCache };
