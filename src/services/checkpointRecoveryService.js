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
    const timer = setInterval(() => {
        run().catch(e => console.error("[RECOVERY] Erro no sync periódico:", e.message));
    }, intervalMs);
    timer.unref?.();
    console.log(`[RECOVERY] Sync por checkpoint a cada ${intervalMs / 1000}s`);
    return () => clearInterval(timer);
}

module.exports = { createSyncGuard, startCheckpointRecovery };
