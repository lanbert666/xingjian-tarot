# 星见塔罗 (XINGJIAN TAROT)

沉浸式塔罗占卜网页应用。静态页面可完全离线运行；需要 AI 个性化解读时，用一个本机 Node 代理连接**任意一家**模型服务——OpenAI、Claude、DeepSeek、自建网关都行，只要对方提供下面三种接口之一。

> 当前为 **V1.3 第一阶段**：新增 AI 用量本地账本、档案馆「星图洞察」、首屏性能预算与 Web Audio 程序化音效。
> V1.3.2 修复：真实网关返回 Responses API 风格的 `input_tokens` / `output_tokens` 时，账本分项不再丢失。
> V1.2 的牌义学习、报告“解读依据”、长报告导航、键盘/焦点/减少动态效果、确定性浏览器回归和 78 张原创牌面（AI 生成，逐张人工验收）均保留。详见 [`SECOND_STAGE_ACCEPTANCE.md`](SECOND_STAGE_ACCEPTANCE.md)。

## 怎么打开

### 离线模式

**双击 `index.html` 就行。** 不需要安装依赖、构建或启动服务器。
所有牌阵、本地解读、每日一抽、历史档案、分享卡片与文案均可使用。

### AI 模式

不配置也能用：所有牌阵、本地解读、每日一抽、档案、分享功能完全不受影响，只是报告由本地解读引擎生成。

要接模型，复制 `.env.example` 为 `.env`（已 gitignore，不会进版本库），按你用的服务商填：

```bash
TAROT_API_KEY=sk-...
TAROT_API_BASE=https://api.openai.com/v1     # 换成你的服务商地址
TAROT_MODEL=gpt-4o-mini                       # 换成你的模型名
```

Claude（Anthropic）示例：

```bash
TAROT_API_KEY=sk-ant-...
TAROT_API_BASE=https://api.anthropic.com/v1
TAROT_MODEL=claude-sonnet-4-5
```

然后 `npm start`，打开 [http://127.0.0.1:8901](http://127.0.0.1:8901)。
头部显示「AI 星见在线」后，解读报告会由模型实时生成，并可在报告底部继续追问。

#### 支持三种接口格式

服务端会把页面统一的请求翻译成对应格式，再把响应翻译回来，所以换供应商只改 `.env`，前端一行都不用动。

| `TAROT_API_FORMAT` | 实际请求 | 适用 |
| --- | --- | --- |
| `openai`（默认） | `POST {base}/chat/completions` | OpenAI 及所有兼容实现（DeepSeek、Moonshot、通义、vLLM、Ollama、OneAPI 等） |
| `anthropic` | `POST {base}/messages` | Claude 及兼容代理（自动处理 `system` 分离与 `x-api-key`） |
| `responses` | `POST {base}/responses` | OpenAI Responses API / 公司网关 |

不写 `TAROT_API_FORMAT` 时按 `TAROT_API_BASE` 猜：地址里含 `anthropic` 或 `claude` 走 Messages，其余按 `openai` 处理。
`TAROT_API_BASE` 末尾不带路径时自动补 `/v1`。

#### 变量表

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TAROT_API_KEY` | 是 | 服务商密钥 |
| `TAROT_API_BASE` | 是 | 接口地址，填到版本号为止，如 `https://api.openai.com/v1` |
| `TAROT_MODEL` | 是 | 模型标识，如 `gpt-4o-mini`、`claude-sonnet-4-5`、`deepseek-chat` |
| `TAROT_API_FORMAT` | 否 | `openai` / `anthropic` / `responses`，默认按地址推断 |
| `TAROT_MAX_TOKENS_PARAM` | 否 | OpenAI 格式下输出上限的字段名，默认 `max_tokens`；o 系列 / gpt-5 等新模型填 `max_completion_tokens` |
| `PORT` | 否 | 本地监听端口，默认 `8901` |
| `TAROT_GATEWAY_CA` | 否 | 自签网关的根证书路径，默认 `gateway-ca.crt`（见下节） |
| `TAROT_GATEWAY_HOST` / `TAROT_GATEWAY_PORT` | 否 | 旧写法，等价于 `TAROT_API_BASE=https://<host>:<port>/v1` + `responses` |

三项必填缺任意一项时，服务器照常启动并打印缺少哪几项，`/api/chat` 返回 503、
`/api/config` 报 `{"ai":false}`，页面自动回退本地解读引擎，不会打断抽牌流程。

也可以直接用 `npm start`（等价于 `node server.js`）。

### 开启网关证书校验（推荐）

公司网关使用内部自签根证书 `<gateway-ca>`。`server.js` 默认 **fail-closed**：

- 项目根目录有 `gateway-ca.crt`（根证书 PEM）时，用它做 pin，`rejectUnauthorized: true`。
- 没有该文件时，不再关闭校验，而是使用系统信任库并拒绝自签名证书；如果网关是自签名证书，
  连接会失败（502），页面回退本地解读。
- 只有显式设置 `TAROT_ALLOW_INSECURE_TLS=1` 才会关闭校验；启动会打印醒目警告。
  仅限临时调试，不要写进 `.env` 或部署脚本。
- `TAROT_GATEWAY_CA` 指向的证书文件存在但读取失败（目录/权限）或内容为空时，服务器启动即退出，
  避免静默降级；文件不存在（ENOENT）按「未配置」处理。

当前工作区根目录已有 `gateway-ca.crt`（根证书，已被 `.gitignore` 忽略，不会进版本库）。
先确认它是根而不是叶：

```powershell
openssl x509 -in gateway-ca.crt -noout -subject -issuer -fingerprint -sha256
openssl verify -CAfile gateway-ca.crt gateway-ca.crt
```

期望 `subject` 与 `issuer` 都是 `CN=<gateway-ca>`，SHA-256 指纹为
`3C:4F:13:87:9A:61:85:1E:A1:4A:11:ED:DD:9C:D6:D1:09:57:29:90:87:F1:C0:F0:9C:E9:1A:78:88:C9:22:9C`，
`openssl verify` 输出 `OK`。

如果文件缺失，从 Windows 证书存储导出根证书。**不要**用
`openssl s_client ... | openssl x509`：网关只发叶证书，该命令取到的是叶证书，
按它配置必然 502。

```powershell
$roots = Get-ChildItem Cert:\LocalMachine\Root, Cert:\CurrentUser\Root |
  Where-Object { $_.Subject -eq 'CN=<gateway-ca>' -and $_.Subject -eq $_.Issuer }
if (-not $roots) { throw '未找到 <gateway-ca> 根证书；请向网关运营方索取根证书 PEM。' }
$root = $roots | Select-Object -First 1
$b64 = [Convert]::ToBase64String($root.RawData, [Base64FormattingOptions]::InsertLineBreaks)
@('-----BEGIN CERTIFICATE-----', $b64, '-----END CERTIFICATE-----') |
  Set-Content -Encoding ascii gateway-ca.crt
```

也可以把根证书放在别处，用环境变量指定：

```powershell
$env:TAROT_GATEWAY_CA = 'D:\certs\<gateway-ca>.pem'
node server.js
```

如果 `TAROT_GATEWAY_URL` 被设成 `http://...`，Bearer 会明文发送；这只允许本机 mock，
生产必须用 `https://`，服务器启动会打印警告。

### 收紧 `.env` 与项目目录权限（共享电脑必做）

`.env` 里有 `TAROT_API_KEY`。如果项目目录继承了 `Authenticated Users:(M)`，同一台电脑上的
其他本地用户也能读 key、改 `server.js`。部署到共享电脑前至少执行：

```powershell
# 1) .env 只允许当前用户访问
icacls .env /inheritance:r /grant:r "$($env:USERNAME):(F)"

# 2) 项目目录去掉继承，只保留当前用户、SYSTEM、Administrators
icacls . /inheritance:r `
  /grant:r "$($env:USERNAME):(OI)(CI)(F)" `
  /grant:r "SYSTEM:(OI)(CI)(F)" `
  /grant:r "Administrators:(OI)(CI)(F)"
```

执行后检查：

```powershell
icacls .env
icacls .
```

如果这台电脑还有其他需要访问项目的账号，把 `$($env:USERNAME)` 换成对应用户，
或额外 `/grant:r "账号:(OI)(CI)(RX)"`。收紧后建议轮换一次 API Key，因为旧 ACL 期间
key 可能已被其他本地用户读取。

> 页面刻意使用普通 `<script>` 而非 ES Module，保证 `file://` 下直接打开也能执行。
> API Key 只从环境变量 / `.env` 读取，代码库中不保存；服务器只监听 `127.0.0.1`，
> 静态文件采用白名单（仅页面运行所需的 html/css/js、牌面 WebP/SVG 与加载清单、分享图与 vendor/），
> 源码、牌面母版与 `.env` 不会被下载。
> AI 在线时，你的问题与牌面会发送到公司模型网关用于生成解读，请知悉。

## 功能

- **四种问题牌阵**：灵光快占（1 张）、二择一（现状 / A / B，3 张）、
  圣三角（过去 / 现在 / 未来，3 张）、凯尔特十字（10 个独立位置）。
- **AI 星见解读与追问**：提示词携带问题、具体牌阵、各位置职责和正逆位；
  十张牌的凯尔特十字同样生成逐位解读与整体串联。旧 AI 响应不会覆盖新一轮占卜。
- **每日一抽**：同一自然日重复打开仍是同一张牌与同一个正逆位；
  按本地日期记录连续观星天数，支持回看与分享。
- **行动与复盘**：为每份报告记录下一步行动，设置 7 / 30 天复盘提醒；
  到期后补充实际结果、感受与“有帮助 / 没帮助”反馈，把占卜转化为持续自我观察。
- **命运档案馆**：自动保存牌阵、牌面、完整分段解读与 AI/本地来源，最多 50 条；
  支持搜索、方向与复盘状态筛选、个人笔记、JSON 导出备份和合并导入，不主动覆盖现有记录。
- **星图洞察**：档案馆内基于本机档案生成四元素分布（权杖火 / 圣杯水 / 宝剑风 / 星币土，
  大阿卡纳归为灵性课题）、近 30 天高频守护牌、逆位比例与行动转化率；
  占比条用纯 SVG 绘制，全部数据从 `cards.js` 派生，零网络、零 AI 调用。
- **AI 用量本地账本**：`server.js` 在每次上游响应后把 `usage` 追加到 `usage-log.jsonl`，
  `GET /api/usage` 返回按天聚合的请求数与 token 数；档案馆底部显示本月汇总，便于到公司核对网关账单。
  账本同时兼容 `prompt_tokens` / `completion_tokens`（旧风格）与 `input_tokens` / `output_tokens`
  （Responses API 风格）：旧字段优先、缺失时回退新字段；`total_tokens` 缺失但两个分项齐全时记为两者之和。
  `file://` 或代理未启动时该行静默隐藏。
- **程序化音效**：洗牌、抽牌入槽、翻牌揭示三种音效全部由 Web Audio 实时合成，不引入音频文件；
  顶栏「♪」开关默认静音并记忆状态，`prefers-reduced-motion: reduce` 时默认关闭并提示原因。
  AudioContext 延迟到首次用户手势才创建，任何音频异常都静默降级，不影响抽牌。
- **隐私优先的社交分享**：默认匿名，图片与自动配文均不包含原始问题；主动选择完整模式后才显示问题。
  生成适合小红书、抖音和朋友圈的竖版星语卡片；
  可下载 PNG、复制自动配好的文案，支持的浏览器还可调用系统分享（含图片）。
- **完整报告长图**：保留原有整页 PNG 导出。
- **牌义学习图鉴**：按大阿卡纳、权杖、圣杯、宝剑、星币和宫廷牌筛选 78 张牌；
  每张牌提供核心象征、正位/逆位关键词、常见误区与自我观察问题，并附二择一、
  圣三角、凯尔特十字的位置说明。内容按需打开，不打断主流程。
- **报告“解读依据”**：逐位解读可展开“为什么这样看”，展示当前牌、位置职责、
  正逆位和本次关键词；完全使用本地数据，不额外请求 AI。
- **长报告导航**：位置目录、行动与复盘直达、回到顶部；辅助说明默认折叠。
- **原创牌面加载机制**：78 张原创牌面已全部完成（Gemini AI 生成母版，逐张人工验收），
  翻牌后按需加载 WebP，SVG 兼容回退，图片失败时显示文字回退；不使用来源不明图片。
- **完整 78 张韦特牌库数据**：22 张大阿卡纳 + 56 张小阿卡纳，支持正逆位。
- **手动 / 自动抽牌、3D 翻牌、敏感话题提醒、移动端布局与减少动态效果支持**。
- **键盘与可访问性**：牌堆、翻牌、弹窗均可键盘操作；弹窗焦点约束与关闭后焦点恢复；
  360px 窄屏、长问题、长 AI 文本、横屏与资源加载失败均有回归覆盖。
- **安全与解读边界**：明确的自伤、自杀危机会在抽牌或发送 AI 前转入现实求助面板；
  医疗、法律与金融问题避免确定性结论，AI 解读允许表达风险、停止与等待，不强行积极。

每日记录和历史档案只保存在当前浏览器的 `localStorage`，不会上传到本服务器；清空浏览器数据会将其删除。AI 在线时，问题与牌面会作为提示词发送到公司模型网关。
“每日一抽”与“清空命运档案”相互独立，清空档案不会重置连续天数。
导入采用合并模式并最多保留 50 条；备份包含问题、解读和笔记等隐私内容，请妥善保存，不要发送到不可信的位置。

## 项目结构

```
index.html                  页面结构、弹窗与脚本入口
style.css                   设计系统、牌阵布局、分享卡片与响应式样式
cards.js                    78 张塔罗牌数据库
features.js                 牌阵、安全路由、复盘筛选、备份校验与学习条目（无 DOM / 网络依赖）
insights.js                 星图洞察统计与 SVG 渲染（无网络、无 AI，统计逻辑可单测）
learning.js                 78 张牌的核心象征、常见误区与自我观察问题
audio.js                    Web Audio 程序化音效与「♪」开关（零音频资产）
app.js                      抽牌、动态报告、AI、复盘、档案、学习页、洞察与分享逻辑
server.js                   可选的本机静态服务器 + 公司网关同源代理 + 用量账本
usage-log.jsonl             本机 AI 用量账本（运行时生成，已在 .gitignore 中）
vendor/html2canvas.min.js   本地内置的图片渲染库
assets/share-card.png       Open Graph / Twitter 分享卡片（1200×630）
assets/cards/               78 张原创牌面（WebP/SVG/AI 母版）、加载清单、资产规范与授权清单
scripts/build-card-deck.cjs    由 cards.js 生成 SVG 回退、清单（含逐牌 sha256）与授权文档（页面运行不需要）
scripts/build-card-assets.cjs  早期 6 张样张的生成脚本（已被 build-card-deck.cjs 取代，留档；检测到 v1.0.0 清单时默认拒绝，确需覆盖须 --force-replace）
tests/features.test.cjs     牌库、牌阵、复盘、筛选、导入与历史裁剪测试
tests/insights.test.cjs     星图洞察：空档案、单条记录、30 天边界、正逆位与行动转化率
tests/learning.test.cjs     78 张牌学习内容、ID 与正逆位关键词一致性测试
tests/server.test.cjs       静态白名单、牌面资产边界、API 校验、413、用量账本与 Host 校验测试
tests/server-hardening.test.cjs  端口占用友好报错、网关证书校验、502 不回显上游原文、用量字段兼容
tests/fixtures/tls/         自签证书测试夹具（仅测试用，不含任何真实网关证书或密钥）
tests/quality.test.cjs      固定质量用例结构、安全路由与位置职责测试
tests/browser.test.cjs      确定性浏览器回归 + 首屏性能预算（Chrome/Edge + 本地 mock，不访问真实网关）
tests/browser/harness.cjs   零依赖 CDP 测试工具与本地静态/mock 服务器
tests/reading-quality-cases.json  AI 解读质量与安全评审用例
PRODUCT_PLAN.md             三阶段产品演进规划
QUALITY_REVIEW.md           AI 解读质量评审维度与方法
SECOND_STAGE_ACCEPTANCE.md  第二阶段验收记录、已知限制与阻塞项
```

脚本加载顺序：渲染库 → 卡牌数据 → 牌阵配置 → 星图洞察 → 学习内容 → 牌面清单 → 音效 → 应用逻辑。

## 检查与测试（可选）

```bash
npm run check
npm test
npm run test:browser
```

只用 Node 自带能力，**不需要 `npm install`**。浏览器回归需要 Node 22+（全局 WebSocket）
以及本机安装 Chrome 或 Edge；测试会启动 headless 浏览器、系统分配的空闲端口和本地 mock 网关，使用固定时间、
固定随机种子和固定 localStorage 数据。服务端测试同样使用临时端口和假 Key，
不占用 8901，也不会向真实网关发送请求。用量账本测试通过 `TAROT_GATEWAY_URL` 指向本机 mock 上游，
并用 `TAROT_USAGE_LOG` 写入临时目录，不会污染项目里的 `usage-log.jsonl`。

浏览器回归覆盖：`file://` 离线模式、四种普通牌阵、每日一抽、复盘持久化、
AI 重试更新同一档案、匿名分享不泄露原始问题、备份导入导出、危机面板、
360px 窄屏、键盘手动抽牌、弹窗焦点约束、减少动态效果、长问题、长 AI 文本、
横屏、图片生成失败、本地存储失败、牌面按需加载与图片加载失败、
星图洞察渲染、音效开关与抽牌流程、用量汇总（含 `file://` 静默隐藏）、
幽灵抽牌（返回修改牌阵后旧抽牌链必须停止）、档案容错（混入 `null`/坏记录仍可打开、
非法时间显示「时间未知」）、追问输入框可访问名称、复盘下拉框 `:focus` 样式，
以及首屏性能预算（DOMContentLoaded < 1s、请求次数上限、传输体积 < 500KB、
翻牌前不请求牌面）。性能阈值定义在 `tests/browser.test.cjs` 顶部并附实测基线说明。
服务端与加固测试覆盖用量字段缺失记 null、两套 usage 字段名映射与回退、缺 `total_tokens` 时按分项求和、
JSONL 追加、按本地自然日聚合、坏行跳过与非本机 Host 拒绝；
加固测试覆盖端口占用友好报错（非零退出、不打印 Node 堆栈）、网关证书校验（正确 CA 通过 / 错误 CA 502 /
未配置时使用系统信任库并提示；显式 `TAROT_ALLOW_INSECURE_TLS=1` 才关闭校验并警告）与 502 默认不回显上游原文
（`TAROT_DEBUG=1` 时才附带）。

## 技术说明

- 牌阵由 `features.js` 的配置驱动，抽牌槽、翻牌区、逐位报告、AI 标记和分享卡片共用位置数据。
- AI 输出先转义再写入页面；分享预览、历史记录、用户问题均使用安全文本节点或转义处理。
- 牌面全部本地托管，无外部图片热链；唯一的运行时外链是 Google Fonts，已异步加载不阻塞首屏，不可达时自动回退系统中文字体。
- 牌面只在翻牌后加载当前牌：WebP 为主，SVG 为兼容回退，两者都失败时显示文字回退。78 张 WebP 合计约 3.7MB，单张 27–62KB（61,440B 上限，实测最大 61,162 字节）；母版为 Gemini AI 生成的 768×1376 JPG，已逐张人工验收并修复边缘瑕疵。规范与授权见
  [`assets/cards/ASSET_SPEC.md`](assets/cards/ASSET_SPEC.md) 与
  [`assets/cards/LICENSE.md`](assets/cards/LICENSE.md)。
- 当前 `og:image` / `twitter:image` 使用 `./assets/share-card.png` 相对路径，`file://` 双击与根路径部署都指向正确文件；以后部署到公网时，需改为完整 HTTPS 绝对 URL，并补充 `og:url`。
- 星空按 devicePixelRatio 适配，页面切到后台时暂停动画；减少动态效果时跳过粒子、洗牌/飞牌等待和持续动画。
- 静态服务器只放行页面所需的白名单文件、`vendor/` 下的 `.js/.css`、牌面目录下的 WebP/SVG 等图片扩展名；
  牌面母版（`tarot-cards/`、`masters/`）、授权文档与生成脚本不对外提供。静态文件先 `realpath` 再校验根目录，
  junction/符号链接不能逃逸；硬链接（`nlink > 1`）直接 404。
- 用量账本只写本机 `usage-log.jsonl`（已加入 `.gitignore`），`/api/usage` 仅响应 `127.0.0.1` / `localhost` / `[::1]` 的本机 Host；
  上游 `usage` 字段缺失或非数字时记 `null`，写文件失败只打日志，不影响解读响应；
  分项兼容 `prompt_tokens` / `completion_tokens`（旧风格）与 `input_tokens` / `output_tokens`（Responses API），
  `total_tokens` 缺失但两个分项齐全时记为两者之和，旧账本行里的 `null` 分项只跳过、不报错。
- 音效全部由 Web Audio 合成，没有音频资产；AudioContext 只在用户手势中创建或 `resume()`，
  页面加载阶段不创建，避免自动播放策略警告。`prefers-reduced-motion: reduce` 时默认静音并在按钮提示原因。
- 首屏性能预算：不请求任何 `assets/cards/webp/` 牌面，传输体积 < 500KB，DOMContentLoaded < 1s；
  `file://` 下 Resource Timing 可能为空，只校验请求次数与牌面请求。

## 免责声明

塔罗解读仅供心灵启发与自我反思，不构成医疗、法律或金融投资建议。
