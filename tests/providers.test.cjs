'use strict';
// 多供应商回归测试：同一个 /api/chat 入口，按 TAROT_API_FORMAT 分别对接
// Responses / OpenAI Chat Completions / Anthropic Messages 三种上游格式。
// 每个用例都起一个本机 mock 上游，断言「发出去的请求形状」和「翻译回来的响应形状」，
// 全程不请求任何真实厂商接口。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

const CHAT_BODY = JSON.stringify({
    input: [
        { role: 'system', content: [{ type: 'input_text', text: '你是星见。' }] },
        { role: 'user', content: [{ type: 'input_text', text: '帮我解牌' }] }
    ],
    max_output_tokens: 512
});

function startMock(reply) {
    return new Promise(resolve => {
        const seen = [];
        const server = http.createServer((req, res) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                seen.push({ url: req.url, headers: req.headers, body });
                const out = reply(req, body);
                res.writeHead(out.status || 200, { 'Content-Type': 'application/json', ...(out.headers || {}) });
                res.end(JSON.stringify(out.body));
            });
        });
        server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port }));
    });
}

// 显式把所有相关变量置空再覆盖，避免开发者本机 .env 里的真实配置漏进测试。
async function startServer(env) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingjian-provider-'));
    const usageLog = path.join(tempDir, 'usage.jsonl');
    const child = spawn(process.execPath, [SERVER], {
        env: {
            ...process.env,
            PORT: '0',
            TAROT_API_KEY: 'sk-test-fake',
            TAROT_MODEL: 'test-model',
            TAROT_USAGE_LOG: usageLog,
            TAROT_GATEWAY_URL: '',
            TAROT_GATEWAY_HOST: '',
            TAROT_GATEWAY_PORT: '',
            TAROT_API_BASE: '',
            TAROT_API_FORMAT: '',
            TAROT_GATEWAY_CA: '',
            TAROT_ALLOW_INSECURE_TLS: '',
            ...env
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('服务器启动超时')), 10000);
        let out = '';
        child.stdout.on('data', chunk => {
            out += String(chunk);
            const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
            if (m) { clearTimeout(timer); resolve(Number(m[1])); }
        });
        child.on('exit', code => { clearTimeout(timer); reject(new Error(`服务器提前退出: ${code}`)); });
    });
    return {
        port,
        child,
        usageLog,
        stop() {
            child.kill();
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    };
}

function postChat(port, body = CHAT_BODY) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            path: '/api/chat',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function readUsage(file) {
    try {
        return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
    } catch {
        return [];
    }
}

test('openai 格式：请求转成 chat/completions，响应翻译回 output[].content[]', async () => {
    const mock = await startMock(() => ({
        body: {
            choices: [{ message: { role: 'assistant', content: '【解读】\n星币王牌正位。' } }],
            usage: { prompt_tokens: 120, completion_tokens: 40 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.output[0].content[0].type, 'output_text');
        assert.equal(res.json.output[0].content[0].text, '【解读】\n星币王牌正位。');

        assert.equal(mock.seen.length, 1);
        assert.equal(mock.seen[0].url, '/v1/chat/completions');
        assert.match(mock.seen[0].headers.authorization, /^Bearer sk-test-fake$/);
        const sent = JSON.parse(mock.seen[0].body);
        assert.equal(sent.model, 'test-model');
        assert.equal(sent.max_tokens, 512);
        assert.equal(sent.input, undefined, '不应把 Responses 的 input 字段发给 chat/completions');
        assert.deepEqual(sent.messages, [
            { role: 'system', content: '你是星见。' },
            { role: 'user', content: '帮我解牌' }
        ]);

        const usage = readUsage(srv.usageLog);
        assert.equal(usage.length, 1);
        assert.equal(usage[0].prompt_tokens, 120);
        assert.equal(usage[0].completion_tokens, 40);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('anthropic 格式：system 单独成字段，用 x-api-key 认证，响应取 text 块', async () => {
    const mock = await startMock(() => ({
        body: {
            content: [
                { type: 'thinking', thinking: '内部推理不应透出' },
                { type: 'text', text: '【解读】\n恋人逆位。' }
            ],
            usage: { input_tokens: 88, output_tokens: 22 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'anthropic'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.output[0].content.length, 1, 'thinking 块不应被当成正文');
        assert.equal(res.json.output[0].content[0].text, '【解读】\n恋人逆位。');

        assert.equal(mock.seen[0].url, '/v1/messages');
        assert.equal(mock.seen[0].headers['x-api-key'], 'sk-test-fake');
        assert.equal(mock.seen[0].headers['anthropic-version'], '2023-06-01');
        assert.equal(mock.seen[0].headers.authorization, undefined, 'Anthropic 不用 Bearer');
        const sent = JSON.parse(mock.seen[0].body);
        assert.equal(sent.system, '你是星见。');
        assert.deepEqual(sent.messages, [{ role: 'user', content: '帮我解牌' }]);
        assert.equal(sent.max_tokens, 512);

        const usage = readUsage(srv.usageLog);
        assert.equal(usage[0].prompt_tokens, 88);
        assert.equal(usage[0].completion_tokens, 22);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('responses 格式：TAROT_API_BASE 也能走 Responses API', async () => {
    const mock = await startMock(() => ({
        body: {
            output: [{ type: 'message', content: [{ type: 'output_text', text: '原样返回' }] }],
            usage: { input_tokens: 10, output_tokens: 5 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'responses'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.output[0].content[0].text, '原样返回');
        assert.equal(mock.seen[0].url, '/v1/responses');
        const sent = JSON.parse(mock.seen[0].body);
        assert.equal(sent.max_output_tokens, 512);
        assert.equal(sent.messages, undefined);
        assert.equal(sent.input.length, 2);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('格式推断：base 里带 anthropic 时自动用 Messages 接口', async () => {
    const mock = await startMock(() => ({ body: { content: [{ type: 'text', text: 'ok' }] } }));
    // 不设 TAROT_API_FORMAT，让服务端从 base 里推断（路径含 anthropic）
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/anthropic/v1`
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(mock.seen[0].url, '/anthropic/v1/messages', '应推断成 Anthropic Messages 接口');
        assert.equal(mock.seen[0].headers['x-api-key'], 'sk-test-fake');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('base 不带路径时自动补 /v1', async () => {
    const mock = await startMock(() => ({ body: { choices: [{ message: { content: 'ok' } }] } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(mock.seen[0].url, '/v1/chat/completions');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('anthropic 的 base 不带版本号时自动补 /v1（Kimi 那种 /coding 前缀）', async () => {
    const mock = await startMock(() => ({ body: { content: [{ type: 'text', text: 'ok' }] } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/coding/`,
        TAROT_API_FORMAT: 'anthropic'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(mock.seen[0].url, '/coding/v1/messages', 'Anthropic 约定 base 不含 /v1，应自动补');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('base 已经写到完整端点时不再重复拼接', async () => {
    const mock = await startMock(() => ({ body: { choices: [{ message: { content: 'ok' } }] } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1/chat/completions`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(mock.seen[0].url, '/v1/chat/completions');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('anthropic 缓存命中时把 cache_read 加回输入侧，账本不记 0', async () => {
    const mock = await startMock(() => ({
        body: {
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 0, cache_creation_input_tokens: 20, cache_read_input_tokens: 91, output_tokens: 34 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'anthropic'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        const usage = readUsage(srv.usageLog);
        assert.equal(usage[0].prompt_tokens, 111, '0 + 20 + 91');
        assert.equal(usage[0].completion_tokens, 34);
        assert.equal(usage[0].total_tokens, 145);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游返回非 2xx 时仍然是通用错误，不透传原文', async () => {
    const mock = await startMock(() => ({
        status: 401,
        body: { error: { message: 'invalid api key for tenant upstream.example.internal' } }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 502);
        assert.equal(res.json.error, 'AI 网关暂时不可用');
        assert.equal(JSON.stringify(res.json).includes('upstream.example.internal'), false, '不应回显上游原文');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('openai finish_reason=length 统一透传为 truncated', async () => {
    const mock = await startMock(() => ({
        body: {
            choices: [{ message: { role: 'assistant', content: '【牌1】\n半句' }, finish_reason: 'length' }],
            usage: { prompt_tokens: 10, completion_tokens: 8 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.truncated, true);
        assert.equal(res.json.truncatedReason, 'length');
        assert.equal(res.json.output[0].content[0].text.includes('半句'), true, '截断正文仍要返回，由前端决定怎么用');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('anthropic stop_reason=max_tokens 统一透传为 truncated', async () => {
    const mock = await startMock(() => ({
        body: {
            content: [{ type: 'text', text: '【牌1】\n半句' }],
            stop_reason: 'max_tokens',
            usage: { input_tokens: 10, output_tokens: 8 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'anthropic'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.truncated, true);
        assert.equal(res.json.truncatedReason, 'max_tokens');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('responses 的 incomplete 状态统一透传为 truncated', async () => {
    const mock = await startMock(() => ({
        body: {
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output: [{ type: 'message', content: [{ type: 'output_text', text: '【牌1】\n半句' }] }],
            usage: { input_tokens: 10, output_tokens: 8 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'responses'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.truncated, true);
        assert.equal(res.json.truncatedReason, 'max_output_tokens');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('openai message.refusal 统一透传为 refusal', async () => {
    const mock = await startMock(() => ({
        body: {
            choices: [{ message: { role: 'assistant', content: '', refusal: 'I cannot help with that.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 4 }
        }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.equal(res.json.refusal, true);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游 401 映射为认证失败文案，同时保留通用错误外壳', async () => {
    const mock = await startMock(() => ({ status: 401, body: { error: { message: 'bad key' } } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 502);
        assert.equal(res.json.error, 'AI 网关暂时不可用');
        assert.equal(res.json.message, 'API Key 无效或没有权限');
        assert.equal(res.json.upstream_status, 401);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游 404 映射为接口地址错误文案', async () => {
    const mock = await startMock(() => ({ status: 404, body: { error: 'not found' } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.json.message, '接口地址不对，请检查 TAROT_API_BASE');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游 429 转发 Retry-After 并给出限流文案', async () => {
    const mock = await startMock(() => ({
        status: 429,
        headers: { 'Retry-After': '17' },
        body: { error: 'rate limited' }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 502);
        assert.equal(res.json.message, '请求过于频繁，请稍后重试');
        assert.equal(res.headers['retry-after'], '17');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游 5xx 映射为模型服务不可用文案', async () => {
    const mock = await startMock(() => ({ status: 503, body: { error: 'overloaded' } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.json.message, '模型服务暂时不可用');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游 200 但没有 usage 时不写账本行，requests 不增加', async () => {
    const mock = await startMock(() => ({
        body: { choices: [{ message: { role: 'assistant', content: '【解读】\n没有 usage 的响应。' } }] }
    }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 200);
        assert.deepEqual(readUsage(srv.usageLog), [], '没有 token 字段时不应写空账本行');
        const summary = await new Promise((resolve, reject) => {
            http.get({ host: '127.0.0.1', port: srv.port, path: '/api/usage' }, response => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
            }).on('error', reject);
        });
        assert.deepEqual(summary, {}, '/api/usage 的 requests 不应把无 usage 的请求算进去');
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});

test('上游失败不写用量账本，避免把重试算成消耗', async () => {
    const mock = await startMock(() => ({ status: 500, body: { error: 'boom' } }));
    const srv = await startServer({
        TAROT_API_BASE: `http://127.0.0.1:${mock.port}/v1`,
        TAROT_API_FORMAT: 'openai'
    });
    try {
        const res = await postChat(srv.port);
        assert.equal(res.status, 502);
        assert.deepEqual(readUsage(srv.usageLog), []);
    } finally {
        srv.stop();
        await new Promise(r => mock.server.close(r));
    }
});