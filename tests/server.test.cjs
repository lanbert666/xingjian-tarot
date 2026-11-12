'use strict';
// 服务端回归测试：以子进程方式在临时端口启动 server.js，
// 用 http.request 直接发送原始路径（fetch/URL 会先折叠 ..，测不到真实攻击面）。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let port;
let child;
let mockUpstream;
let usageLog;
let tempDir;
let upstreamResponse = { status: 200, body: {} };

function rawRequest(rawPath, { method = 'GET', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: rawPath, // 原样发送，不做 URL 规范化
            method,
            headers: body ? { 'Content-Type': 'application/json', ...headers } : headers
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function startMockUpstream() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            req.resume();
            req.on('end', () => {
                res.writeHead(upstreamResponse.status || 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(upstreamResponse.body || {}));
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function readUsageLines() {
    try {
        return fs.readFileSync(usageLog, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    } catch {
        return [];
    }
}

function clearUsageLog() {
    try { fs.unlinkSync(usageLog); } catch { /* 文件本来就不存在 */ }
}

const VALID_CHAT = JSON.stringify({
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'E2E usage 测试' }] }]
});

test.before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingjian-usage-'));
    usageLog = path.join(tempDir, 'usage-log.jsonl');
    mockUpstream = await startMockUpstream();
    const mockPort = mockUpstream.address().port;
    child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
        env: {
            ...process.env,
            PORT: '0',
            TAROT_NO_ENV: '1', // 不读开发机上的 .env，避免真实网关配置盖过下面的 mock 地址
            TAROT_API_KEY: 'sk-test-fake', // 假 key：只为绕过 503 前置检查，不会真实请求网关
            TAROT_MODEL: 'test-model', // 模型名已改为环境变量，测试用占位值
            TAROT_GATEWAY_URL: `http://127.0.0.1:${mockPort}/v1/responses`,
            TAROT_USAGE_LOG: usageLog
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('服务器启动超时')), 10000);
        let output = '';
        child.stdout.on('data', chunk => {
            output += String(chunk);
            const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
            if (match) {
                port = Number(match[1]);
                clearTimeout(timer);
                resolve();
            }
        });
        child.on('exit', code => { clearTimeout(timer); reject(new Error(`服务器提前退出: ${code}`)); });
    });
});

test.after(async () => {
    if (child) child.kill();
    if (mockUpstream) await new Promise(resolve => mockUpstream.close(resolve));
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('静态白名单：/vendor/ 前缀无法通过 ../ 或编码绕过', async () => {
    for (const p of ['/vendor/../.env', '/vendor/..%2f.env', '/vendor/%2e%2e%2fserver.js',
        '/vendor/..%5c.env', '/vendor/../package.json', '/vendor/../tests/features.test.cjs']) {
        const res = await rawRequest(p);
        assert.ok([400, 403, 404].includes(res.status), `${p} 应被拒绝，实际 ${res.status}`);
        assert.ok(!res.body.includes('TAROT') && !res.body.includes('require('), `${p} 泄漏了文件内容`);
    }
});

test('静态白名单：源码与配置文件直接访问全部 404', async () => {
    for (const p of ['/server.js', '/.env', '/.gitignore', '/package.json', '/tests/features.test.cjs']) {
        const res = await rawRequest(p);
        assert.equal(res.status, 404, `${p} 应 404，实际 ${res.status}`);
    }
});

test('静态白名单：页面所需文件可正常访问', async () => {
    for (const p of ['/', '/index.html', '/style.css', '/app.js', '/cards.js', '/features.js',
        '/insights.js', '/learning.js', '/audio.js',
        '/assets/share-card.png', '/vendor/html2canvas.min.js', '/assets/cards/manifest.js',
        '/assets/cards/webp/m00.webp', '/assets/cards/fallback/m00.svg',
        '/assets/cards/webp/p13.webp', '/assets/cards/fallback/p13.svg']) {
        const res = await rawRequest(p);
        assert.equal(res.status, 200, `${p} 应 200，实际 ${res.status}`);
    }
});

test('牌面母版、授权文档与生成脚本不进入静态白名单', async () => {
    for (const p of ['/assets/cards/masters/m00.svg', '/assets/cards/ASSET_SPEC.md',
        '/assets/cards/LICENSE.md', '/scripts/build-card-assets.cjs',
        '/assets/cards/webp/../masters/m00.svg', '/assets/cards/webp/%2e%2e/masters/m00.svg',
        '/assets/cards/tarot-cards/m00.jpg', '/assets/cards/webp/../tarot-cards/m00.jpg']) {
        const res = await rawRequest(p);
        assert.ok([400, 403, 404].includes(res.status), `${p} 应被拒绝，实际 ${res.status}`);
        assert.ok(!res.body.includes('<svg') && !res.body.includes('CC BY'), `${p} 泄漏了母版或授权文档`);
    }
});

test('畸形编码返回 400 且进程存活', async () => {
    for (const p of ['/%', '/%00', '/vendor/%', '/vendor/%00']) {
        const res = await rawRequest(p);
        assert.ok([400, 404].includes(res.status), `${p} 应 400/404，实际 ${res.status}`);
    }
    const alive = await rawRequest('/api/config');
    assert.equal(alive.status, 200, '畸形请求后进程应仍然存活');
});

test('/api/config 只报告 AI 在线状态，不下发模型名', async () => {
    const res = await rawRequest('/api/config');
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body, { ai: true });
    assert.equal('model' in body, false, '模型名不应出现在配置响应里');
});

test('/api/chat 入参校验', async () => {
    assert.equal((await rawRequest('/api/chat')).status, 405, 'GET 应 405');
    const empty = await rawRequest('/api/chat', { method: 'POST', body: '{}' });
    assert.equal(empty.status, 400);
    const badJson = await rawRequest('/api/chat', { method: 'POST', body: 'not json' });
    assert.equal(badJson.status, 400);
});

test('/api/chat 拒绝跨域 Origin', async () => {
    const res = await rawRequest('/api/chat', {
        method: 'POST', body: '{}', headers: { Origin: 'https://evil.example.com' }
    });
    assert.equal(res.status, 403);
});

test('超大请求体返回 413 而非断连，进程存活', async () => {
    const res = await rawRequest('/api/chat', { method: 'POST', body: 'x'.repeat(300 * 1024) });
    assert.equal(res.status, 413, `应 413，实际 ${res.status}`);
    const alive = await rawRequest('/api/config');
    assert.equal(alive.status, 200, '超限请求后进程应仍然存活');
});

test('/api/usage 文件不存在时返回空对象', async () => {
    clearUsageLog();
    const res = await rawRequest('/api/usage');
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(res.body), {});
});

test('/api/usage 按本地自然日聚合并忽略坏行', async () => {
    const records = [
        { ts: '2026-10-29T10:00:00+08:00', prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 },
        { ts: '2026-10-29T23:30:00+08:00', prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
        { ts: '2026-10-28T09:00:00+08:00', prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        { ts: '2026-10-29T12:00:00+08:00', prompt_tokens: null, completion_tokens: null, total_tokens: null }
    ];
    fs.writeFileSync(usageLog, records.map(record => JSON.stringify(record)).join('\n') + '\n{坏行\n', 'utf8');
    const res = await rawRequest('/api/usage');
    assert.equal(res.status, 200);
    const days = JSON.parse(res.body);
    const keyOf = ts => {
        const date = new Date(ts);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const expected = {};
    for (const record of records) {
        const key = keyOf(record.ts);
        expected[key] = expected[key] || { requests: 0, total_tokens: 0 };
        expected[key].requests += 1;
        expected[key].total_tokens += Number(record.total_tokens) || 0;
    }
    assert.deepEqual(days, expected);
    assert.equal(Object.keys(days).length, 2, '坏行与空行不应产生日期桶');
});

test('/api/usage 拒绝非本机 Host', async () => {
    const res = await rawRequest('/api/usage', { headers: { Host: 'evil.example.com' } });
    assert.equal(res.status, 403, `非本机 Host 应 403，实际 ${res.status}`);
    assert.ok(!res.body.includes('requests'), '拒绝响应不得泄漏账本内容');
});

test('/api/chat 解析 usage 并逐条追加 JSONL', async () => {
    clearUsageLog();
    upstreamResponse = {
        status: 200,
        body: { output: [], usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 } }
    };
    const first = await rawRequest('/api/chat', { method: 'POST', body: VALID_CHAT });
    assert.equal(first.status, 200, `第一次请求应 200，实际 ${first.status}`);
    let lines = readUsageLines();
    assert.equal(lines.length, 1, '每次上游响应应追加一行');
    assert.equal(lines[0].prompt_tokens, 11);
    assert.equal(lines[0].completion_tokens, 22);
    assert.equal(lines[0].total_tokens, 33);
    assert.ok(Number.isFinite(Date.parse(lines[0].ts)), 'ts 应为可解析的 ISO 时间');

    upstreamResponse = {
        status: 200,
        body: { output: [], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }
    };
    const second = await rawRequest('/api/chat', { method: 'POST', body: VALID_CHAT });
    assert.equal(second.status, 200);
    lines = readUsageLines();
    assert.equal(lines.length, 2, 'JSONL 应追加而不是覆盖');
    assert.equal(lines[1].total_tokens, 3);

    const usage = JSON.parse((await rawRequest('/api/usage')).body);
    const usageDate = new Date(lines[0].ts);
    const today = `${usageDate.getFullYear()}-${String(usageDate.getMonth() + 1).padStart(2, '0')}-${String(usageDate.getDate()).padStart(2, '0')}`;
    assert.equal(usage[today].requests, 2);
    assert.equal(usage[today].total_tokens, 36);
});

test('200 但无 usage 时不写账本行', async () => {
    clearUsageLog();
    upstreamResponse = { status: 200, body: { output: [] } };
    const res = await rawRequest('/api/chat', { method: 'POST', body: VALID_CHAT });
    assert.equal(res.status, 200, 'usage 缺失不得影响主流程');
    const lines = readUsageLines();
    assert.equal(lines.length, 0, '没有 token 字段时不应写空账本行，requests 也不应增加');

    clearUsageLog();
    upstreamResponse = { status: 200, body: { usage: { prompt_tokens: 7 } } };
    const partial = await rawRequest('/api/chat', { method: 'POST', body: VALID_CHAT });
    assert.equal(partial.status, 200);
    const [partialLine] = readUsageLines();
    assert.equal(partialLine.prompt_tokens, 7);
    assert.equal(partialLine.completion_tokens, null);
    assert.equal(partialLine.total_tokens, null);
});
