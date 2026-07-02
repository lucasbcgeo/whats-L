const queues = new Map();

async function enqueue(key, fn) {
    const prev = queues.get(key) || Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    queues.set(key, next);
    try {
        return await next;
    } finally {
        if (queues.get(key) === next) {
            queues.delete(key);
        }
    }
}

module.exports = { enqueue };
