'use strict';
// V1.3.1 服务端加固回归：端口占用友好报错、网关证书校验、502 不回显上游原文。
// V1.3.2 追加用量账本字段兼容回归：Responses API 的 input_tokens / output_tokens。
// 全部使用临时端口与本地 mock，不访问真实网关、不读取 .env。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const TLS_DIR = path.join(__dirname, 'fixtures', 'tls');
const GATEWAY_CERT = path.join(TLS_DIR, 'gateway-cert.pem');
const WRONG_CERT = path.join(TLS_DIR, 'wrong-cert.pem');

const VALID_CHAT = JSON.stringify({
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'V1.3.1 加固测试' }] }]
});

let tempDir;
let usageLog;
let missingCa;

test.before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingjian-hardening-'));
    usageLog = path.join(tempDir, 'usage-log.jsonl');
    // 测试必须自包含：开发者本机可能已按 README 放好真实的 gateway-ca.crt，
    // 「未配置证书」的用例要显式指向一个不存在的路径，否则结果取决于本机配置。
    missingCa = path.join(tempDir, 'no-such-gateway-ca.crt');
});

test.after(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

// 启动一个 server.js 子进程；端口交给系统分配，避免与 8901 冲突。
function startServer(env) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SERVER], {
            // TAROT_MODEL：模型名已改为环境变量，测试统一用占位值，避免依赖本机 .env
            env: { ...process.env, PORT: '0', TAROT_USAGE_LOG: usageLog, TAROT_MODEL: 'test-model', ...env },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill();
            reject(new Error('服务器启动超时: ' + stderr));
        }, 15000);
        child.stdout.on('data', chunk => {
            stdout += chunk;
            const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
            if (match && !settled) {
                settled = true;
                clearTimeout(timer);
                resolve({
                    child,
                    port: Number(match[1]),
                    stdout: () => stdout,
                    stderr: () => stderr,
                    stop: () => child.kill()
                });
            }
        });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('exit', code => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error('服务器提前退出 ' + code + ': ' + stderr));
        });
    });
}

// 启动日志的 stdout/stderr 是两条独立的管道，到达顺序不保证；
// 断言 stderr 时必须轮询等待，不能靠固定 sleep。
async function waitForStderr(server, pattern, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (pattern.test(server.stderr())) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
}

function postChat(port, body = VALID_CHAT) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port, path: '/api/chat', method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// 用测试证书起一个 https 上游，模拟公司网关的自签名证书。
function startHttpsMock() {
    return new Promise(resolve => {
        const server = https.createServer({
            key: fs.readFileSync(path.join(TLS_DIR, 'gateway-key.pem')),
            cert: fs.readFileSync(GATEWAY_CERT)
        }, (req, res) => {
            req.resume();
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    output: [{ type: 'message', content: [{ type: 'output_text', text: 'TLS-OK' }] }],
                    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
                }));
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function startNonJsonMock() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            req.resume();
            req.on('end', () => {
                res.writeHead(502, { 'Content-Type': 'text/html' });
                res.end('<html><body>INTERNAL-UPSTREAM-SECRET-9f3a gateway stack trace</body></html>');
            });
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// 返回固定 JSON 的 mock 上游，用于构造不同 usage 字段组合。
function startJsonMock(body) {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            req.resume();
            req.on('end', () => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(body));
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

// 用本地 mock 网关跑一次 /api/chat，返回账本最后追加的那一行。
async function recordOneUsage(body) {
    clearUsageLog();
    const upstream = await startJsonMock(body);
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${upstream.address().port}/v1/responses`
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 200, `应 200，实际 ${res.status}: ${res.body}`);
        const lines = readUsageLines();
        assert.equal(lines.length, 1, '每次上游响应应追加一行');
        return lines[0];
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
}

// 与 recordOneUsage 相同，但允许「上游 200 却不写账本行」，返回全部账本行。
async function recordUsageRows(body) {
    clearUsageLog();
    const upstream = await startJsonMock(body);
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${upstream.address().port}/v1/responses`
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 200, `应 200，实际 ${res.status}: ${res.body}`);
        return readUsageLines();
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
}

function getJson(port, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET' }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        req.end();
    });
}

test('端口占用：友好报错、非零退出且不打印 Node 堆栈', async () => {
    const first = await startServer({});
    try {
        const second = spawn(process.execPath, [SERVER], {
            env: { ...process.env, PORT: String(first.port), TAROT_USAGE_LOG: usageLog },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stderr = '';
        second.stderr.on('data', chunk => { stderr += chunk; });
        const code = await new Promise(resolve => second.on('exit', resolve));

        assert.equal(code, 1, '端口占用应以非零码退出');
        assert.match(stderr, /端口 \d+ 已被占用/, '应给出中文可操作提示');
        assert.match(stderr, /PORT=xxxx/, '应提示如何换端口');
        assert.ok(!/at Server\.|Unhandled 'error'|node:events/.test(stderr), `不应打印 Node 堆栈，实际：${stderr}`);
    } finally {
        first.stop();
    }
});

test('网关证书：配置正确 CA 时完成校验并正常转发', async () => {
    const upstream = await startHttpsMock();
    const port = upstream.address().port;
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `https://127.0.0.1:${port}/v1/responses`,
        TAROT_GATEWAY_CA: GATEWAY_CERT
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 200, `应 200，实际 ${res.status}: ${res.body}`);
        assert.match(res.body, /TLS-OK/);
        assert.equal(server.stderr().includes('TLS 校验已关闭'), false, '配置了证书不应再警告');
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
});

test('网关证书：配置错误 CA 时握手失败并返回 502', async () => {
    const upstream = await startHttpsMock();
    const port = upstream.address().port;
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `https://127.0.0.1:${port}/v1/responses`,
        TAROT_GATEWAY_CA: WRONG_CERT
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 502, `证书不匹配应 502，实际 ${res.status}: ${res.body}`);
        assert.match(res.body, /无法连接网关/, '应说明是连接/校验失败');
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
});

test('网关证书：未配置时启动打印中间人风险警告', async () => {
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_HOST: 'gateway.example.com',
        TAROT_GATEWAY_PORT: '52000',
        TAROT_GATEWAY_CA: missingCa
    });
    try {
        assert.ok(await waitForStderr(server, /未配置网关证书/), '应提示未配置网关证书，实际 stderr：' + JSON.stringify(server.stderr()));
        const stderr = server.stderr();
        assert.match(stderr, /中间人风险/, '应点明中间人风险');
        assert.match(stderr, /gateway-ca\.crt/, '应给出证书文件位置');
        assert.match(stderr, /README/, '应指向 README 获取导出方法');
    } finally {
        server.stop();
    }
});

test('网关证书：离线模式（无 Key）不打印 TLS 警告', async () => {
    // 显式传空 Key：开发者本机可能已有 .env，loadDotEnv 不会覆盖已存在的变量，
    // 否则这个「离线模式」用例会取决于本机是否配置了真实 Key。
    const server = await startServer({ TAROT_API_KEY: '', TAROT_GATEWAY_CA: missingCa });
    try {
        // 反证：给足时间让日志刷完，仍然不应出现警告
        await new Promise(resolve => setTimeout(resolve, 800));
        assert.equal(server.stderr().includes('中间人风险'), false, '离线模式不产生 TLS 连接，不应警告');
        assert.match(server.stdout(), /AI 功能离线/);
    } finally {
        server.stop();
    }
});

test('502 默认不回显上游原文', async () => {
    const upstream = await startNonJsonMock();
    const port = upstream.address().port;
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${port}/v1/responses`
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 502);
        const parsed = JSON.parse(res.body);
        assert.equal(parsed.error, '网关返回了非 JSON 内容');
        assert.equal('raw' in parsed, false, '默认响应不应包含 raw 字段');
        assert.ok(!res.body.includes('INTERNAL-UPSTREAM-SECRET'), '不得回显上游原文');
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
});

test('502 在 TAROT_DEBUG=1 时附带原文，便于排查', async () => {
    const upstream = await startNonJsonMock();
    const port = upstream.address().port;
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${port}/v1/responses`,
        TAROT_DEBUG: '1'
    });
    try {
        const res = await postChat(server.port);
        assert.equal(res.status, 502);
        const parsed = JSON.parse(res.body);
        assert.equal(typeof parsed.raw, 'string');
        assert.ok(parsed.raw.includes('INTERNAL-UPSTREAM-SECRET'), '调试模式应保留原文');
    } finally {
        server.stop();
        await new Promise(resolve => upstream.close(resolve));
    }
});

// V1.3.2：真实网关返回 Responses API 风格的 usage 字段，账本必须正确映射分项。
test('用量账本：Responses API 风格 input_tokens/output_tokens 正确映射', async () => {
    const line = await recordOneUsage({
        output: [],
        usage: { input_tokens: 21, output_tokens: 13, total_tokens: 34 }
    });
    assert.equal(line.prompt_tokens, 21, 'input_tokens 应映射到 prompt_tokens');
    assert.equal(line.completion_tokens, 13, 'output_tokens 应映射到 completion_tokens');
    assert.equal(line.total_tokens, 34);
    assert.ok(Number.isFinite(Date.parse(line.ts)), 'ts 应为可解析的 ISO 时间');
});

test('用量账本：两套字段同时存在时旧字段优先', async () => {
    const line = await recordOneUsage({
        output: [],
        usage: {
            prompt_tokens: 5, input_tokens: 50,
            completion_tokens: 6, output_tokens: 60,
            total_tokens: 11
        }
    });
    assert.equal(line.prompt_tokens, 5, 'prompt_tokens 应优先于 input_tokens');
    assert.equal(line.completion_tokens, 6, 'completion_tokens 应优先于 output_tokens');
    assert.equal(line.total_tokens, 11);
});

test('用量账本：旧风格 prompt_tokens/completion_tokens 行为不变', async () => {
    const line = await recordOneUsage({
        output: [],
        usage: { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16 }
    });
    assert.equal(line.prompt_tokens, 7);
    assert.equal(line.completion_tokens, 9);
    assert.equal(line.total_tokens, 16);
});

test('用量账本：缺 total_tokens 时总数记为两个分项之和', async () => {
    const gatewayStyle = await recordOneUsage({
        output: [],
        usage: { input_tokens: 4, output_tokens: 6 }
    });
    assert.equal(gatewayStyle.prompt_tokens, 4);
    assert.equal(gatewayStyle.completion_tokens, 6);
    assert.equal(gatewayStyle.total_tokens, 10);

    const legacyStyle = await recordOneUsage({
        output: [],
        usage: { prompt_tokens: 2, completion_tokens: 3 }
    });
    assert.equal(legacyStyle.prompt_tokens, 2);
    assert.equal(legacyStyle.completion_tokens, 3);
    assert.equal(legacyStyle.total_tokens, 5);
});

test('用量账本：usage 缺失或字段非数字记 null 且响应不中断', async () => {
    const missing = await recordUsageRows({ output: [] });
    assert.equal(missing.length, 0, '无 usage 时不写空账本行，requests 不应增加');

    const nonNumeric = await recordUsageRows({
        output: [],
        usage: { input_tokens: 'abc', output_tokens: null, total_tokens: 'x' }
    });
    assert.equal(nonNumeric.length, 0, '字段全非数字时同样不写空账本行');

    const partial = await recordUsageRows({ output: [], usage: { prompt_tokens: 7 } });
    assert.equal(partial.length, 1, '至少有一个有效分项时仍应记账');
    assert.equal(partial[0].prompt_tokens, 7);
    assert.equal(partial[0].completion_tokens, null);
    assert.equal(partial[0].total_tokens, null, '只有一个分项时不应臆造总数');
});

test('/api/usage 兼容旧账本行：null 分项不报错，缺 total 时按分项之和聚合', async () => {
    const records = [
        { ts: '2026-10-29T10:00:00', prompt_tokens: 12, completion_tokens: 8, total_tokens: null },
        { ts: '2026-10-29T11:00:00', prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        { ts: '2026-10-29T12:00:00', prompt_tokens: null, completion_tokens: null, total_tokens: null },
        { ts: '2026-10-29T13:00:00', prompt_tokens: 5, completion_tokens: null, total_tokens: null }
    ];
    clearUsageLog();
    fs.writeFileSync(usageLog, records.map(record => JSON.stringify(record)).join('\n') + '\n{坏行\n', 'utf8');
    const server = await startServer({});
    try {
        const res = await getJson(server.port, '/api/usage');
        assert.equal(res.status, 200, '旧账本行不得让聚合报错');
        const days = JSON.parse(res.body);
        assert.deepEqual(days['2026-10-29'], { requests: 4, total_tokens: 27 });
    } finally {
        server.stop();
    }
});

// 带自定义 Host / Origin 的请求：模拟隧道/反代把公网域名转发到本机。
function requestWithHeaders(port, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path,
            method,
            headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }
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

test('公网部署：TAROT_ALLOWED_HOSTS 放行的隧道域名可调用 /api/config 与 /api/chat', async () => {
    const upstream = await startJsonMock({ output: [], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } });
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${upstream.address().port}/v1/responses`,
        TAROT_ALLOWED_HOSTS: 'tarot.example.com, abc.trycloudflare.com'
    });
    const host = 'tarot.example.com';
    try {
        const config = await requestWithHeaders(server.port, { path: '/api/config', headers: { Host: host } });
        assert.equal(config.status, 200, `放行域名应能读配置，实际 ${config.status}`);
        assert.deepEqual(JSON.parse(config.body), { ai: true });

        const chat = await requestWithHeaders(server.port, {
            method: 'POST',
            path: '/api/chat',
            headers: { Host: host, Origin: `https://${host}`, 'Sec-Fetch-Site': 'same-origin' },
            body: VALID_CHAT
        });
        assert.equal(chat.status, 200, `放行域名应能对话，实际 ${chat.status}: ${chat.body}`);

        const other = await requestWithHeaders(server.port, { path: '/api/config', headers: { Host: 'evil.example.com' } });
        assert.equal(other.status, 403, '未放行的域名仍应 403');

        const badOrigin = await requestWithHeaders(server.port, {
            method: 'POST',
            path: '/api/chat',
            headers: { Host: host, Origin: 'https://evil.example.com', 'Sec-Fetch-Site': 'same-origin' },
            body: VALID_CHAT
        });
        assert.equal(badOrigin.status, 403, '放行域名的页面也不该被其他站点跨站调用');
    } finally {
        server.stop();
        upstream.close();
    }
});

test('公网部署：/api/usage 即使域名被放行也仍只响应本机', async () => {
    const server = await startServer({ TAROT_ALLOWED_HOSTS: 'tarot.example.com' });
    try {
        const remote = await requestWithHeaders(server.port, { path: '/api/usage', headers: { Host: 'tarot.example.com' } });
        assert.equal(remote.status, 403, '用量账本属于部署方私有信息，不对公网开放');
    } finally {
        server.stop();
    }
});

test('公网部署：TAROT_TRUST_PROXY=1 时按 CF-Connecting-IP 分别限流', async () => {
    const upstream = await startJsonMock({ output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${upstream.address().port}/v1/responses`,
        TAROT_ALLOWED_HOSTS: 'tarot.example.com',
        TAROT_TRUST_PROXY: '1'
    });
    const host = 'tarot.example.com';
    try {
        const call = ip => requestWithHeaders(server.port, {
            method: 'POST',
            path: '/api/chat',
            headers: { Host: host, Origin: `https://${host}`, 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': ip },
            body: VALID_CHAT
        });
        for (let i = 0; i < 30; i += 1) {
            const res = await call('203.0.113.7');
            assert.equal(res.status, 200, `第 ${i + 1} 次应放行，实际 ${res.status}`);
        }
        const blocked = await call('203.0.113.7');
        assert.equal(blocked.status, 429, '同一访客超过 30 次/分钟应被限流');

        const otherVisitor = await call('198.51.100.9');
        assert.equal(otherVisitor.status, 200, '换一个访客不应受上一个访客的限流影响');
    } finally {
        server.stop();
        upstream.close();
    }
});

test('公网部署：TAROT_DAILY_LIMIT 达到当日上限后返回 429', async () => {
    const upstream = await startJsonMock({ output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } });
    const server = await startServer({
        TAROT_API_KEY: 'sk-test-fake',
        TAROT_GATEWAY_URL: `http://127.0.0.1:${upstream.address().port}/v1/responses`,
        TAROT_ALLOWED_HOSTS: 'tarot.example.com',
        TAROT_DAILY_LIMIT: '2'
    });
    const host = 'tarot.example.com';
    try {
        const call = () => requestWithHeaders(server.port, {
            method: 'POST',
            path: '/api/chat',
            headers: { Host: host, Origin: `https://${host}`, 'Sec-Fetch-Site': 'same-origin' },
            body: VALID_CHAT
        });
        assert.equal((await call()).status, 200, '第 1 次应放行');
        assert.equal((await call()).status, 200, '第 2 次应放行');
        const third = await call();
        assert.equal(third.status, 429, '超过当日上限应拒绝');
        assert.match(third.body, /今日/, '应给出可读的中文提示');
    } finally {
        server.stop();
        upstream.close();
    }
});
