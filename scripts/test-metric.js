require('dotenv').config();
const { metricService } = require('../src/services/metricService');
const { checkpoint } = require('../src/services/dedupeService');

async function main() {
    const fakeTimestamp = Math.floor(Date.now() / 1000);
    const fakeMsgId = `test-${Date.now()}`;

    console.log('=== Test Harness: metricService ===');
    console.log('Timestamp:', new Date(fakeTimestamp * 1000).toISOString());

    const tests = [
        { metric: 'ansiedade', value: 5, ts: fakeTimestamp, note: 'Teste ansiedade nivel 5' },
        { metric: 'ansiedade', value: 8, ts: fakeTimestamp + 60, note: 'Teste ansiedade nivel 8 (deve manter 5)' },
        { metric: 'exercicio', value: true, ts: fakeTimestamp + 120, note: 'Teste exercicio true' },
        { metric: 'procrastinacao', value: 3, ts: fakeTimestamp + 180, note: 'Teste procrastinacao nivel 3' },
        { metric: 'lazer', value: false, ts: fakeTimestamp + 240, note: 'Teste lazer false' },
        { metric: 'leitura', value: true, ts: fakeTimestamp + 300, note: 'Teste leitura true' },
    ];

    for (const test of tests) {
        console.log(`\n--- ${test.note} ---`);
        try {
            const result = await metricService.saveMetric({
                metric: test.metric,
                value: test.value,
                timestamp: test.ts,
                msgId: `${fakeMsgId}-${test.metric}`,
                force: false,
            });
            console.log('Result:', result);
        } catch (e) {
            console.error('ERROR:', e.message);
        }
    }

    console.log('\n=== Testes de forca (correcao) ===');
    try {
        await metricService.saveMetric({
            metric: 'ansiedade',
            value: 10,
            timestamp: fakeTimestamp,
            msgId: `${fakeMsgId}-ansiedade-force`,
            force: true,
        });
        console.log('Ansiedade forcada para 10: OK');
    } catch (e) {
        console.error('ERROR:', e.message);
    }

    console.log('\n=== Verificacao checkpoint ===');
    console.log('Last ts:', checkpoint.getLastTs());

    console.log('\n=== Fim do teste ===');
}

main().catch(e => {
    console.error('Test harness failed:', e);
    process.exit(1);
});
