const baseUrl = process.env.LOAD_BASE_URL || 'http://127.0.0.1:3001';
const accessToken = process.env.LOAD_ACCESS_TOKEN || '';
const qrToken = process.env.LOAD_QR_TOKEN || '';
const mode = process.env.LOAD_MODE || 'resolve';
const durationSeconds = Number(process.env.LOAD_DURATION_SECONDS || 30);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10);

if (!accessToken || !qrToken) {
    console.error('LOAD_ACCESS_TOKEN and LOAD_QR_TOKEN are required');
    process.exit(1);
}

const endpoint = mode === 'pickup'
    ? '/api/bib-tracking/scan/pickup'
    : '/api/bib-tracking/scan/resolve';

const deadline = Date.now() + durationSeconds * 1000;
const stats = {
    total: 0,
    success: 0,
    failed: 0,
    durations: [],
};

async function hitEndpoint() {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrToken }),
    });
    const durationMs = Date.now() - startedAt;
    stats.total += 1;
    stats.durations.push(durationMs);
    if (response.ok) {
        stats.success += 1;
    } else {
        stats.failed += 1;
        const body = await response.text().catch(() => '');
        console.error(`Request failed: ${response.status} ${body}`);
    }
}

async function worker() {
    while (Date.now() < deadline) {
        await hitEndpoint();
    }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const durations = stats.durations.sort((left, right) => left - right);
const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
const p95 = durations[p95Index] || 0;
const average = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : 0;

console.log(JSON.stringify({
    mode,
    total: stats.total,
    success: stats.success,
    failed: stats.failed,
    avgMs: Number(average.toFixed(2)),
    p95Ms: p95,
    concurrency,
    durationSeconds,
}, null, 2));
