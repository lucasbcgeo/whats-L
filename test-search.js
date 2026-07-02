process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config({ path: 'G:/Projetos/whats-L/.env' });

const rawKey = process.env.LOCAL_REST_API_OBSI_LUCAS;
const key = rawKey.startsWith('Bearer ') ? rawKey.slice(7) : rawKey;
const BASE = 'https://127.0.0.1:27125';

async function search(query) {
    const q = encodeURIComponent(query);
    const res = await fetch(`${BASE}/search/simple/?query=${q}`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key },
        signal: AbortSignal.timeout(10000)
    });
    return await res.json();
}

async function readNote(notePath) {
    const encoded = encodeURIComponent(notePath);
    const res = await fetch(`${BASE}/vault/${encoded}`, {
        headers: { 'Authorization': 'Bearer ' + key },
        signal: AbortSignal.timeout(5000)
    });
    return await res.text();
}

(async () => {
    // 1. Search API response format
    console.log('=== SEARCH: "- [ ] ⏳" ===');
    const data = await search('- [ ]');
    const entries = Object.values(data);
    console.log('Total results:', entries.length);

    for (const entry of entries.slice(0, 5)) {
        console.log('\nFile:', entry.filename);
        for (const m of (entry.matches || []).slice(0, 1)) {
            const ctx = m.context || '';
            // Show lines with - [ ]
            const lines = ctx.split('\n').filter(l => l.includes('- [ ]'));
            for (const line of lines.slice(0, 3)) {
                console.log('  TASK:', line.trim().substring(0, 120));
            }
        }
    }

    // 2. Direct read a daily note
    console.log('\n=== READ: 2026-07-01.md ===');
    const content = await readNote('01_Arquivos/Jornada/2026/07/2026-07-01.md');
    const taskLines = content.split('\n').filter(l => l.includes('- [ ]'));
    for (const line of taskLines) {
        console.log('TASK:', line.trim().substring(0, 120));
    }
})();
