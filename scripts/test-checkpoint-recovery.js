const assert = require("assert");
const { createSyncGuard } = require("../src/services/checkpointRecoveryService");

async function main() {
    let calls = 0;
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const run = createSyncGuard(async () => {
        calls++;
        await pending;
    });

    const first = run();
    assert.strictEqual(await run(), false, "não deve sobrepor duas sincronizações");
    assert.strictEqual(calls, 1);
    release();
    assert.strictEqual(await first, true);
    assert.strictEqual(await run(), true, "deve permitir nova sincronização após concluir");
    assert.strictEqual(calls, 2);
}

main().then(() => console.log("checkpoint recovery: ok"));
