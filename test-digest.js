process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: 'G:/Projetos/whats-L/.env' });

const { startDailyDigest, runDigest } = require('./src/services/dailyDigestService');
const { fetchNews, formatNews } = require('./src/services/newsService');

async function testDigest() {
    console.log('=== TESTE: Daily Digest Completo ===\n');

    // Mock client (não envia WhatsApp)
    const mockClient = {
        getChats: async () => [{
            isGroup: true,
            name: 'Minime',
            sendMessage: async (msg) => {
                console.log('\n=== MENSAGEM QUE SERIA ENVIADA ===');
                console.log(msg);
                console.log('=== FIM DA MENSAGEM ===');
            }
        }]
    };

    // Forçar execução ignorando alreadyRanToday
    const stateFile = require('path').join(__dirname, 'data', 'daily_digest_state.json');
    const fs = require('fs');
    try { fs.unlinkSync(stateFile); } catch {}

    await runDigest(mockClient);
}

testDigest().catch(e => {
    console.error('Erro no teste:', e.message);
    console.error(e.stack);
});
