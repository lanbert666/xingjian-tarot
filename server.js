/**
 * 星见塔罗 —— AI 网关代理 + 静态服务器（零依赖，Node 18+ 直接运行）
 *
 * 为什么需要它：
 *   公司模型网关使用自签名证书，浏览器 fetch 会直接拦截；
 *   同时 file:// 页面跨域调用也会被 CORS 拦截。
 *   本服务器同时托管静态页面并同源转发 /api 请求到网关，
 *   API Key 只从本机环境变量 / .env 读取，代码里不保存、也不会下发到浏览器。
 *
 * 配置 API Key（二选一）：
 *   1. 环境变量：  PowerShell> $env:TAROT_API_KEY="sk-..."; node server.js
 *   2. 项目根目录新建 .env（已在 .gitignore 中），内容为：TAROT_API_KEY=sk-...
 * 未配置时服务器照常启动，AI 接口返回 503，页面自动回退为本地解读引擎。
 *
 * 使用：node server.js  然后访问 http://127.0.0.1:8901
 * （直接双击 index.html 仍可离线运行，只是 AI 功能自动回退为本地解读引擎）
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 先加载 .env，再读取任何 process.env：否则 .env 里的 PORT/TAROT_USAGE_LOG/
// TAROT_GATEWAY_URL 会被下面的常量提前求值而忽略。
loadDotEnv(path.join(__dirname, '.env'));

const rawPort = String(process.env.PORT ?? '').trim();
const LISTEN_PORT = rawPort === '' ? 8901 : Number(rawPort);
if (!Number.isInteger(LISTEN_PORT) || LISTEN_PORT < 0 || LISTEN_PORT >= 65536) {
    console.error('PORT 必须是 0 到 65535 之间的整数，例如 PORT=8901 node server.js');
    process.exit(1);
}
let activePort = LISTEN_PORT;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const USAGE_MAX_BYTES = 5 * 1024 * 1024;
const activeUpstreams = new Set();
let shuttingDown = false;
// 网关地址与模型名属于部署方私有配置，不写进版本库：
// 在 .env（已 gitignore）里设置 TAROT_GATEWAY_HOST / TAROT_GATEWAY_PORT / TAROT_MODEL。
// 未配置时服务器照常启动，/api/chat 返回 503，页面回退本地解读引擎。
const TARGET_HOST = String(process.env.TAROT_GATEWAY_HOST || '').trim();
const TARGET_PORT = Number(process.env.TAROT_GATEWAY_PORT) || 0;
const MODEL = String(process.env.TAROT_MODEL || '').trim();

// 本地用量账本：每条上游响应追加一行 JSONL，作为到公司核对网关账单的证据。
// 测试可用 TAROT_USAGE_LOG 指向临时文件，避免污染项目目录。
const USAGE_LOG = process.env.TAROT_USAGE_LOG || path.join(__dirname, 'usage-log.jsonl');

// 测试专用网关覆盖：默认仍走公司网关；只有显式设置 TAROT_GATEWAY_URL 时才改道，
// 让回归测试可以连接本机 mock 上游，绝不会请求真实网关。
const GATEWAY = (() => {
    if (!process.env.TAROT_GATEWAY_URL) return null;
    try {
        const url = new URL(process.env.TAROT_GATEWAY_URL);
        return {
            protocol: url.protocol === 'http:' ? 'http:' : 'https:',
            host: url.hostname,
            port: Number(url.port) || (url.protocol === 'http:' ? 80 : 443),
            path: `${url.pathname}${url.search}`
        };
    } catch {
        console.error('TAROT_GATEWAY_URL 不是合法 URL，已忽略并回退默认网关。');
        return null;
    }
})();

// 解析项目根目录的 .env（KEY=VALUE，一行一条，# 开头为注释），不覆盖已有环境变量
function loadDotEnv(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        if (!(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
}
const API_KEY = process.env.TAROT_API_KEY || '';

// 网关使用内部自签根证书。把根证书 PEM 存为项目根目录的 gateway-ca.crt
//（已在 .gitignore 中），存在时用它做 pin 并开启完整校验。
// 未配置证书时不再关闭校验：默认使用系统信任库并拒绝自签名证书；
// 只有显式 TAROT_ALLOW_INSECURE_TLS=1 才允许关闭校验（仅限临时调试）。
// 证书路径存在但读取失败（EISDIR/EACCES 等）或内容为空时直接退出，避免静默 fail-open。
const GATEWAY_CA_ENV = String(process.env.TAROT_GATEWAY_CA || '').trim();
const GATEWAY_CA_PATH = GATEWAY_CA_ENV || path.join(__dirname, 'gateway-ca.crt');
const ALLOW_INSECURE_TLS = process.env.TAROT_ALLOW_INSECURE_TLS === '1';
let gatewayCa = null;
try {
    gatewayCa = fs.readFileSync(GATEWAY_CA_PATH);
    if (gatewayCa.length === 0) {
        console.error(`网关证书为空：${GATEWAY_CA_PATH}。请放入根证书 PEM，或删除该文件以使用系统信任库。`);
        process.exit(1);
    }
} catch (err) {
    if (err.code !== 'ENOENT') {
        console.error(`读取网关证书失败：${GATEWAY_CA_PATH}：${err.message}`);
        process.exit(1);
    }
    // ENOENT 视为「未配置证书」，继续使用系统信任库；显式 TAROT_GATEWAY_CA
    // 指向不存在的文件也按未配置处理，避免把「没放证书」误判成配置损坏。
}
const agent = new https.Agent(gatewayCa
    ? { ca: [gatewayCa], rejectUnauthorized: true }
    : { rejectUnauthorized: !ALLOW_INSECURE_TLS });
const GATEWAY_USES_TLS = !GATEWAY || GATEWAY.protocol === 'https:';
// 项目根的真实路径：静态文件 realpath 后用它判断是否越界（项目本身可能位于 junction 下）。
const ROOT_REAL = (() => {
    try { return fs.realpathSync(__dirname); } catch { return __dirname; }
})();

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// 静态文件白名单：只放行页面运行所需的最小文件集，
// server.js、.env、tests/、node_modules/ 等一律 404，避免源码与密钥外泄
const STATIC_WHITELIST = new Set([
    '/', '/index.html', '/style.css', '/app.js', '/cards.js', '/features.js', '/insights.js',
    '/learning.js', '/audio.js',
    '/assets/share-card.png', '/assets/cards/manifest.js'
]);
const VENDOR_PREFIX = '/vendor/';
// 牌面只发布 WebP 与 SVG 回退；masters/ 母版、生成脚本和授权文档不对外提供。
const CARD_ASSET_PREFIXES = ['/assets/cards/webp/', '/assets/cards/fallback/'];
// 前缀白名单只放行页面真正需要的扩展名：/vendor/ 只允许 JS/CSS，
// 牌面目录只允许图片。否则写入 evil.html 就能以同源 text/html 执行脚本。
const VENDOR_EXTENSIONS = new Set(['.js', '.css']);
const CARD_EXTENSIONS = new Set(['.webp', '.svg', '.png', '.jpg', '.jpeg', '.avif']);

function isStaticAllowed(url) {
    return STATIC_WHITELIST.has(url)
        || url.startsWith(VENDOR_PREFIX)
        || CARD_ASSET_PREFIXES.some(prefix => url.startsWith(prefix));
}

function isStaticExtensionAllowed(url) {
    const ext = path.posix.extname(url).toLowerCase();
    if (url.startsWith(VENDOR_PREFIX)) return VENDOR_EXTENSIONS.has(ext);
    if (CARD_ASSET_PREFIXES.some(prefix => url.startsWith(prefix))) return CARD_EXTENSIONS.has(ext);
    return true;
}

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    // Google Fonts 的 CSS 从 googleapis 加载；字体文件从 gstatic 加载。
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self'",
    // index.html 的字体 <link onload> 是内联事件处理器；只放开属性，不放开内联 <script>。
    "script-src-attr 'unsafe-inline'",
    "connect-src 'self'",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
].join('; ');

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': CONTENT_SECURITY_POLICY
};

function sendJson(res, status, obj) {
    if (res.headersSent || res.writableEnded) return;
    const body = JSON.stringify(obj);
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS
    };
    res.writeHead(status, headers);
    // HEAD 与 GET 同头，但不写响应体。
    if (res.req && res.req.method === 'HEAD') res.end();
    else res.end(body);
}

function sendMethodNotAllowed(res, allow) {
    res.setHeader('Allow', allow);
    return sendJson(res, 405, { error: '请求方法不被支持' });
}

function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let settled = false;
        req.on('data', c => {
            if (settled) return; // 超限后只排空请求，不再积攒到内存
            size += c.length;
            if (size > limit) {
                settled = true;
                chunks.length = 0;
                const err = new Error('body too large');
                err.code = 'BODY_TOO_LARGE';
                req.resume(); // 不销毁 socket，让调用方有机会把 413 写回客户端
                reject(err);
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            resolve(Buffer.concat(chunks));
        });
        req.on('error', err => {
            if (settled) return;
            settled = true;
            reject(err);
        });
    });
}

// 简单滑动窗口限流：每客户端每分钟最多 30 次对话，防止本机其他进程刷爆网关配额
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 30;
const rateBuckets = new Map();
function rateLimit(key) {
    const now = Date.now();
    const list = (rateBuckets.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
    if (list.length >= RATE_MAX) {
        rateBuckets.set(key, list);
        return false;
    }
    list.push(now);
    rateBuckets.set(key, list);
    return true;
}

// 限流键只使用 socket 远端地址，不信任任何客户端头。x-session-id 由客户端控制，
// 轮换它就能绕过限流；本机页面共享 127.0.0.1，因此共享 30/min 额度。
function rateLimitKey(req) {
    return `${req.socket.remoteAddress || 'unknown'}|tarot-local`;
}
setInterval(() => {
    const now = Date.now();
    for (const [key, list] of rateBuckets) {
        if (list.every(t => now - t >= RATE_WINDOW_MS)) rateBuckets.delete(key);
    }
}, RATE_WINDOW_MS).unref();

function isLocalOrigin(origin) {
    let url;
    try { url = new URL(origin); } catch { return false; }
    // 只接受 http/https；ftp/file 等 scheme 即使 host 是本机也不能作为同源页面。
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return isLocalHost(url.host);
}

// Host 校验：/api/usage 会暴露本机用量，只响应从本机地址访问的请求，
// 防止通过 DNS rebinding 或局域网别名读取账本。
function isLocalHost(host) {
    return [`127.0.0.1:${activePort}`, `localhost:${activePort}`, `[::1]:${activePort}`]
        .includes(String(host || '').toLowerCase());
}

// 单个 token 字段的防御式解析：缺失、空串或非数字一律记 null。
function toTokenCount(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// 上游 usage 字段可能缺失或类型异常；缺失记 null，但绝不因此中断主流程。
// 网关存在两套字段命名：经典风格 prompt_tokens / completion_tokens，
// 以及 Responses API 风格 input_tokens / output_tokens。每个方向旧字段优先，
// 缺失或不可用时回退新字段；两套都没有 total_tokens 但两个分项齐全时，总数记分项之和。
function parseUsage(payload) {
    const usage = payload && typeof payload === 'object' && payload.usage && typeof payload.usage === 'object'
        ? payload.usage
        : {};
    const readFirst = keys => {
        for (const key of keys) {
            const value = toTokenCount(usage[key]);
            if (value !== null) return value;
        }
        return null;
    };
    const promptTokens = readFirst(['prompt_tokens', 'input_tokens']);
    const completionTokens = readFirst(['completion_tokens', 'output_tokens']);
    const totalTokens = toTokenCount(usage.total_tokens)
        ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null);
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens
    };
}

function rotateUsageLogIfNeeded() {
    let stat;
    try {
        stat = fs.statSync(USAGE_LOG);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('检查用量账本失败：', err.message);
        return;
    }
    if (stat.size < USAGE_MAX_BYTES) return;
    const rotated = `${USAGE_LOG}.1`;
    try {
        try { fs.unlinkSync(rotated); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        fs.renameSync(USAGE_LOG, rotated);
    } catch (err) {
        console.error('轮转用量账本失败：', err.message);
    }
}

function recordUsage(payload) {
    const usage = parseUsage(payload);
    const line = JSON.stringify({ ts: new Date().toISOString(), ...usage });
    rotateUsageLogIfNeeded();
    try {
        fs.appendFileSync(USAGE_LOG, `${line}\n`, 'utf8');
    } catch (err) {
        // 账本写失败只影响对账，不影响本次解读响应
        console.error('写入用量账本失败：', err.message);
    }
}

function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 读取 JSONL 并按本地自然日聚合；文件不存在、空行或坏行都跳过而不是报错。
function readUsageByDay() {
    const days = {};
    // 当前账本 + 上一份轮转账本；轮转后旧数据仍可汇总，但读取量有上限。
    for (const file of [USAGE_LOG, `${USAGE_LOG}.1`]) {
        let text;
        try {
            text = fs.readFileSync(file, 'utf8');
        } catch (err) {
            if (err.code !== 'ENOENT') console.error('读取用量账本失败：', err.message);
            continue;
        }
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            let record;
            try { record = JSON.parse(line); } catch { continue; }
            const date = new Date(record && record.ts);
            if (!Number.isFinite(date.getTime())) continue;
            const key = localDayKey(date);
            const bucket = days[key] || (days[key] = { requests: 0, total_tokens: 0 });
            bucket.requests += 1;
            // 新账本行已保证 total_tokens 有值；旧行若缺 total 但两个分项齐全，
            // 按分项之和计入，null / 非数字分项只跳过，绝不报错。
            const total = toTokenCount(record.total_tokens);
            if (total !== null) {
                bucket.total_tokens += total;
            } else {
                const prompt = toTokenCount(record.prompt_tokens);
                const completion = toTokenCount(record.completion_tokens);
                if (prompt !== null && completion !== null) bucket.total_tokens += prompt + completion;
            }
        }
    }
    return days;
}

// 转发对话请求到网关的 Responses API
async function handleChat(req, res) {
    if (!API_KEY) return sendJson(res, 503, { error: 'AI 未配置：请设置 TAROT_API_KEY 后重启服务器' });
    if (!GATEWAY && !TARGET_HOST) return sendJson(res, 503, { error: 'AI 未配置：请设置 TAROT_GATEWAY_HOST 后重启服务器' });
    if (!MODEL) return sendJson(res, 503, { error: 'AI 未配置：请设置 TAROT_MODEL 后重启服务器' });

    // Host 校验：只接受本机地址，挡住 DNS rebinding 把攻击者域名解析到 127.0.0.1。
    if (!isLocalHost(req.headers.host)) return sendJson(res, 403, { error: 'forbidden host' });

    // Origin 校验：只允许本服务同源页面调用，挡住其他网站借浏览器蹭配额。
    const origin = req.headers.origin;
    if (origin && !isLocalOrigin(origin)) return sendJson(res, 403, { error: 'forbidden origin' });

    // 浏览器跨站/同站请求直接拒绝；非浏览器客户端没有该头，仍由 Host/Origin 约束。
    const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
        return sendJson(res, 403, { error: 'forbidden fetch site' });
    }

    // 只接受 JSON：表单/text/plain 简单请求无法伪造 application/json 而不触发 CORS 预检。
    const mediaType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
        return sendJson(res, 415, { error: 'Content-Type 必须是 application/json' });
    }

    if (!rateLimit(rateLimitKey(req))) {
        res.setHeader('Retry-After', '60');
        return sendJson(res, 429, { error: '请求过于频繁，请稍后再试' });
    }

    let payload;
    try {
        const raw = await readBody(req, 256 * 1024);
        payload = JSON.parse(raw.toString('utf8'));
    } catch (err) {
        if (err && err.code === 'BODY_TOO_LARGE') return sendJson(res, 413, { error: '请求体过大' });
        return sendJson(res, 400, { error: '请求体不是合法 JSON' });
    }

    // 入参校验：input 必须是结构合法的消息数组，避免畸形请求原样打到网关
    if (!payload || !Array.isArray(payload.input) || payload.input.length === 0 || payload.input.length > 40) {
        return sendJson(res, 400, { error: 'input 必须是非空消息数组（最多 40 条）' });
    }
    const valid = payload.input.every(m => m && typeof m.role === 'string' && Array.isArray(m.content)
        && m.content.every(c => c && typeof c.type === 'string' && typeof c.text === 'string' && c.text.length <= 8000));
    if (!valid) return sendJson(res, 400, { error: 'input 消息格式不正确' });
    const totalChars = payload.input.reduce((n, m) => n + m.content.reduce((s, c) => s + c.text.length, 0), 0);
    if (totalChars > 30000) return sendJson(res, 400, { error: '对话内容过长' });

    let maxTokens = Math.floor(Number(payload.max_output_tokens)) || 4096;
    maxTokens = Math.min(Math.max(maxTokens, 16), 8000);

    const upstreamBody = JSON.stringify({
        model: MODEL,
        input: payload.input,
        max_output_tokens: maxTokens,
        ...(payload.reasoning && typeof payload.reasoning === 'object' ? { reasoning: payload.reasoning } : {})
    });

    const gateway = GATEWAY || { protocol: 'https:', host: TARGET_HOST, port: TARGET_PORT, path: '/v1/responses' };
    const transport = gateway.protocol === 'http:' ? http : https;
    const opts = {
        host: gateway.host,
        port: gateway.port,
        path: gateway.path,
        method: 'POST',
        ...(gateway.protocol === 'https:' ? { agent } : {}),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(upstreamBody)
        },
        timeout: 120000
    };

    // 任何路径（正常、上游中断、客户端中断、超时）都只响应一次；客户端已断开时不再写响应。
    let responded = false;
    let upstreamDone = false;
    let clientGone = false;
    const respond = (status, obj) => {
        if (responded || clientGone || res.destroyed) return;
        responded = true;
        sendJson(res, status, obj);
    };
    const abortUpstream = () => {
        if (!upstreamDone) up.destroy();
    };

    const up = transport.request(opts, (upRes) => {
        const chunks = [];
        let upstreamBytes = 0;
        upRes.on('data', c => {
            upstreamBytes += c.length;
            // 上游异常/被劫持时可能返回超大响应；超过 2MB 立即中止并 502，
            // 避免把整个响应读进内存后 OOM。
            if (upstreamBytes > MAX_UPSTREAM_BYTES) {
                respond(502, { error: '网关响应过大' });
                abortUpstream();
                return;
            }
            chunks.push(c);
        });
        upRes.on('end', () => {
            upstreamDone = true;
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch {
                // 默认不回显上游原文：错误页里可能带内部地址、堆栈或凭据片段。
                // 排查时用 TAROT_DEBUG=1 临时打开。
                respond(502, {
                    error: '网关返回了非 JSON 内容',
                    ...(process.env.TAROT_DEBUG === '1' ? { raw: text.slice(0, 500) } : {})
                });
                return;
            }
            // 客户端已断开时不再记账；否则先记账再响应。
            if (clientGone || res.destroyed) return;
            recordUsage(parsed);
            // 非 2xx 一律返回通用错误；上游状态码/错误体只写服务端日志，
            // 避免把内部地址、堆栈或凭据片段透传给浏览器。排查时用 TAROT_DEBUG=1。
            if (upRes.statusCode < 200 || upRes.statusCode >= 300) {
                console.error(`网关返回 ${upRes.statusCode}：`, text.slice(0, 500));
                respond(502, {
                    error: 'AI 网关暂时不可用',
                    ...(process.env.TAROT_DEBUG === '1'
                        ? { upstream_status: upRes.statusCode, upstream: text.slice(0, 500) }
                        : {})
                });
                return;
            }
            respond(upRes.statusCode, parsed);
        });
        // 响应头已发出后上游断开：error/aborted/close 都可能触发，respond 只生效一次。
        upRes.on('error', () => { respond(502, { error: 'upstream_aborted' }); abortUpstream(); });
        upRes.on('aborted', () => { respond(502, { error: 'upstream_aborted' }); abortUpstream(); });
        upRes.on('close', () => {
            if (!upRes.complete && !upstreamDone) {
                respond(502, { error: 'upstream_aborted' });
                abortUpstream();
            }
        });
        // 响应体迟迟不结束的兜底（请求级 timeout 只覆盖到响应头）。
        upRes.setTimeout(120000, () => { respond(504, { error: '网关响应超时' }); abortUpstream(); });
    });
    activeUpstreams.add(up);
    up.on('close', () => activeUpstreams.delete(up));
    up.on('timeout', () => { respond(504, { error: '网关响应超时' }); abortUpstream(); });
    up.on('error', (e) => {
        if (upstreamDone || clientGone || shuttingDown || responded) return;
        console.error('无法连接网关：', e.message);
        respond(502, {
            error: '无法连接网关',
            ...(process.env.TAROT_DEBUG === '1' ? { detail: e.message } : {})
        });
    });
    up.end(upstreamBody);

    // 客户端提前断开：取消上游请求，避免继续计费/占用。
    // req 'close' 在正常请求完成时也会触发，必须用 aborted/writableEnded 区分。
    const onClientGone = () => {
        if (res.writableEnded) return;
        clientGone = true;
        abortUpstream();
    };
    req.on('aborted', onClientGone);
    req.on('close', () => { if (req.aborted) onClientGone(); });
    res.on('close', onClientGone);
    res.on('finish', () => {
        if (!upstreamDone) abortUpstream();
    });
}

async function handleRequest(req, res) {
    const url = String(req.url || '').split('?')[0];

    // AI 配置探活：页面据此判断 AI 是否在线（不下发密钥，只告知是否已配置）。
    // 与 /api/usage 一样只允许本机 Host，避免 DNS rebinding 页面读取配置。
    if (url === '/api/config') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendMethodNotAllowed(res, 'GET, HEAD');
        if (!isLocalHost(req.headers.host)) return sendJson(res, 403, { error: 'forbidden host' });
        // 只告知是否已配置，不下发模型名：前端不需要，也不该让页面暴露后端选型。
        return sendJson(res, 200, { ai: Boolean(API_KEY && MODEL && (GATEWAY || TARGET_HOST)) });
    }
    // 本机用量汇总：只允许本机 Host 读取，返回按天聚合的请求数与本机账本 token 数。
    if (url === '/api/usage') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return sendMethodNotAllowed(res, 'GET, HEAD');
        if (!isLocalHost(req.headers.host)) return sendJson(res, 403, { error: 'forbidden host' });
        return sendJson(res, 200, readUsageByDay());
    }
    if (url === '/api/chat') {
        if (req.method !== 'POST') return sendMethodNotAllowed(res, 'POST');
        return handleChat(req, res);
    }

    // 静态文件：HEAD 与 GET 等价（只返回头，不返回响应体）
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendMethodNotAllowed(res, 'GET, HEAD');
    if (!isStaticAllowed(url)) {
        return sendJson(res, 404, { error: '未找到请求的资源' });
    }

    let rel;
    try {
        rel = decodeURIComponent(url === '/' ? '/index.html' : url);
    } catch {
        return sendJson(res, 400, { error: 'URL 编码无效' });
    }
    if (rel.includes('\0')) return sendJson(res, 400, { error: '请求路径无效' });
    // URL 路径只允许正斜杠；反斜杠在 Windows 会被当成目录分隔符，
    // 若不拒绝，/vendor/..%5c.env 会绕过基于 / 的规范化与白名单。
    if (rel.includes('\\')) return sendJson(res, 400, { error: '请求路径无效' });

    // 必须先解码、折叠 . / ..，再做白名单判断；否则 /vendor/../.env 会先骗过前缀检查。
    const normalized = path.posix.normalize(rel.startsWith('/') ? rel : `/${rel}`);
    if (!isStaticAllowed(normalized) || !isStaticExtensionAllowed(normalized)) {
        return sendJson(res, 404, { error: '未找到请求的资源' });
    }

    const filePath = path.resolve(__dirname, `.${normalized}`);
    const relative = path.relative(__dirname, filePath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return sendJson(res, 403, { error: '禁止访问' });
    }

    // 先解析真实路径：junction/symlink 可能把白名单目录指向项目外。
    // 再校验真实路径仍在项目根内、且真实 URL 仍属于白名单，最后才 stat/read。
    fs.realpath(filePath, (realErr, realPath) => {
        if (realErr) return sendJson(res, 404, { error: '未找到请求的资源' });
        const realRelative = path.relative(ROOT_REAL, realPath);
        if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
            return sendJson(res, 403, { error: '禁止访问' });
        }
        const realUrl = `/${realRelative.split(path.sep).join('/')}`;
        if (!isStaticAllowed(realUrl) || !isStaticExtensionAllowed(realUrl)) {
            return sendJson(res, 404, { error: '未找到请求的资源' });
        }

        fs.stat(realPath, (statErr, stat) => {
            if (statErr || !stat.isFile()) return sendJson(res, 404, { error: '未找到请求的资源' });
            // 硬链接没有可解析的目标；nlink > 1 说明同一内容有多个入口，拒绝以免绕过根目录边界。
            if (stat.nlink > 1) return sendJson(res, 404, { error: '未找到请求的资源' });
            // 牌面 URL 不带版本号，不能再用 7 天强缓存；改为 no-cache + ETag，
            // 浏览器每次带 If-None-Match 校验，文件未变时只回 304。
            const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
            const cacheHeaders = {
                'Cache-Control': 'no-cache',
                ETag: etag,
                ...SECURITY_HEADERS
            };
            const inm = req.headers['if-none-match'];
            const notModified = inm === '*' || (typeof inm === 'string' && inm.split(',').some(tag => {
                const value = tag.trim();
                return value === etag || value === `W/${etag}`;
            }));
            if (notModified) {
                res.writeHead(304, cacheHeaders);
                return res.end();
            }
            const contentType = MIME[path.extname(realPath).toLowerCase()] || 'application/octet-stream';
            if (req.method === 'HEAD') {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': stat.size,
                    ...cacheHeaders
                });
                return res.end();
            }
            fs.readFile(realPath, (err, data) => {
                if (err) return sendJson(res, 404, { error: '未找到请求的资源' });
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': data.length,
                    ...cacheHeaders
                });
                res.end(data);
            });
        });
    });
}

const server = http.createServer((req, res) => {
    // 兜底：任何解析异常都不能让进程退出，只返回错误响应
    handleRequest(req, res).catch(err => {
        console.error('请求处理异常：', err);
        sendJson(res, 500, { error: 'internal error' });
    });
});

// 畸形 HTTP 请求（非法方法/头等）也会触发 clientError，静默断掉即可，不影响进程
server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

// 端口被占用等启动错误：给出可操作的提示，而不是把 Node 堆栈甩给用户。
server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${LISTEN_PORT} 已被占用，请关闭旧进程或用 PORT=xxxx node server.js 换端口`);
    } else if (err.code === 'EACCES') {
        console.error(`没有权限监听端口 ${LISTEN_PORT}，请改用 1024 以上的端口：PORT=8901 node server.js`);
    } else {
        console.error('服务器启动失败：', err.message);
    }
    if (!server.listening) process.exit(1);
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
    activePort = server.address().port;
    console.log(`星见塔罗 AI 服务器已启动: http://127.0.0.1:${activePort}`);
    if (API_KEY && MODEL && (GATEWAY || TARGET_HOST)) {
        console.log(`AI 已启用：${MODEL} @ ${GATEWAY ? GATEWAY.host : `${TARGET_HOST}:${TARGET_PORT}`}`);
        // http 网关会把 Bearer 明文发到网络上；只适合本机 mock，生产必须 https。
        if (GATEWAY && GATEWAY.protocol === 'http:') {
            console.warn('');
            console.warn('⚠️  TAROT_GATEWAY_URL 使用明文 http，Authorization Bearer 会以明文发送。');
            console.warn('   仅限本机 mock；生产环境必须使用 https。');
            console.warn('');
        }
        // 只有真要连网关时才提示 TLS 风险；离线模式不产生任何 TLS 连接。
        if (!gatewayCa && GATEWAY_USES_TLS) {
            if (ALLOW_INSECURE_TLS) {
                console.warn('');
                console.warn('⚠️  TAROT_ALLOW_INSECURE_TLS=1：TLS 校验已关闭，存在中间人风险。');
                console.warn('   任何能插入网络路径的人都可以冒充网关并拿到 API Key；仅限临时调试。');
                console.warn('');
            } else {
                console.warn('');
                console.warn('⚠️  未配置网关证书，将使用系统信任库校验；自签名网关会连接失败。');
                console.warn(`   把网关根证书 PEM 保存为 ${GATEWAY_CA_PATH} 后重启即可开启完整校验。`);
                console.warn('   这不会关闭 TLS 校验，因此不存在中间人风险；导出方法见 README「开启网关证书校验」一节。');
                console.warn('');
            }
        }
    } else {
        const missing = [];
        if (!API_KEY) missing.push('TAROT_API_KEY');
        if (!GATEWAY && !TARGET_HOST) missing.push('TAROT_GATEWAY_HOST');
        if (!MODEL) missing.push('TAROT_MODEL');
        console.log(`AI 功能离线：缺少 ${missing.join(' / ')}；页面将自动使用本地解读引擎。`);
        console.log('配置方法：把 .env.example 复制为 .env，填好上述变量后重启。');
    }
});

// 优雅停机：先停止接收新连接，让在途请求完成；10s 仍未结束则销毁上游并强制退出。
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`收到 ${signal}，正在关闭服务器...`);
    if (!server.listening) process.exit(0);
    const forceExit = setTimeout(() => {
        console.error('优雅关闭超时，强制退出');
        for (const up of activeUpstreams) {
            try { up.destroy(); } catch { /* 忽略已结束的请求 */ }
        }
        process.exit(1);
    }, 10000);
    forceExit.unref();
    server.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
    });
    // 关闭空闲 keep-alive 连接，避免 server.close() 一直等它们超时。
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));