const { scheduleReconnect } = require("../lib/whatsappClient");

function isDetachedFrameError(e) {
    const msg = (e?.message || "").toLowerCase();
    return msg.includes("detached frame") ||
        msg.includes("session expired") ||
        msg.includes("target closed") ||
        msg.includes("frame detached") ||
        msg.includes("protocol error (runtime.callfunctionon)");
}

function createSyncGuard(syncFn) {
    let running = false;
    return async () => {
        if (running) return false;
        running = true;
        try {
            await syncFn();
            return true;
        } finally {
            running = false;
        }
    };
}

function startCheckpointRecovery(syncFn, intervalMs = 60_000) {
    const run = createSyncGuard(syncFn);
    let lastReconnectAttempt = 0;
    const RECONNECT_COOLDOWN_MS = 120_000;
    const timer = setInterval(async () => {
        try {
            await run();
        } catch (e) {
            console.error("[RECOVERY] Erro no sync periódico:", e.message);
            if (isDetachedFrameError(e)) {
                const now = Date.now();
                if (now - lastReconnectAttempt >= RECONNECT_COOLDOWN_MS) {
                    lastReconnectAttempt = now;
                    console.log("[RECOVERY] Frame detach detectado. Acionando reconexão do WhatsApp...");
                    scheduleReconnect();
                }
            }
        }
    }, intervalMs);
    timer.unref?.();
    console.log(`[RECOVERY] Sync por checkpoint a cada ${intervalMs / 1000}s`);
    return () => clearInterval(timer);
}

module.exports = { createSyncGuard, startCheckpointRecovery };
