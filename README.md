# AgentCRM

AgentCRM is an AI-assisted CRM built with React, Vite, Express, and PostgreSQL/pgvector. It includes customer management, unified Email/WhatsApp inbox, sales quotes, products, media library, knowledge base vectorization, AI agent workflows, user management, and system settings.

AgentCRM 是一个基于 React、Vite、Express 和 PostgreSQL/pgvector 的 AI CRM 系统，包含客户管理、统一 Email/WhatsApp 收件箱、销售报价、产品库、媒体素材库、知识库向量化、AI 智能体工作流、用户管理和系统设置。

---

## English Usage Guide

### Local Development

```bash
npm install
npm run dev
```

Open the printed local URL, usually:

```text
http://localhost:3000
```

### Default Login

Authentication requires PostgreSQL. When `DATABASE_URL` or `PG_VECTOR_URL` is configured, the server seeds default accounts on first run:

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### Environment Variables

Create `.env` from `.env.example`:

```text
PORT=3000
DATABASE_URL=postgresql://...
PG_VECTOR_URL=postgresql://...
JWT_SECRET=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
```

`DATABASE_URL` stores CRM data. `PG_VECTOR_URL` is used by the vector knowledge base. In GitHub Actions deployment, `PG_VECTOR_URL` can be set from `DATABASE_URL` when only one database URL is provided.

### Data Persistence

Business data is stored in PostgreSQL, not only in browser storage. The frontend keeps local storage only as a fallback/cache layer.

Database-backed data includes:

- Customers and Public Pool leads
- Unified inbox Email/WhatsApp messages
- WhatsApp chatId to mob mappings
- WhatsApp message translation cache
- WhatsApp per-number auto-translate preferences for received and outbound messages
- Model Profiles
- Agents, agent runs, trace steps, and approvals
- System users
- App settings
- Media records
- Email receive/send profiles, account mappings, and signatures

### Main Features

- **Dashboard**: CRM metrics, unread messages, estimated revenue, pending work, and a GitHub-style contribution chart.
- **Customer Management**: Create, edit, delete, search, tag, CSV import, Public Pool lead claiming, and List/Map views. The Map view shows a world map, country counts, and click-to-filter behavior.
- **Unified Inbox**: Manage Email and WhatsApp conversations in one place. Supports Inbox/Sent views, fixed channel filters for All/WhatsApp/Email, search, bulk delete, bulk tag, bulk follow-up with due date, mark important, delete, sync, assignee, internal comments, and AI analysis.
- **WhatsApp Conversations**: WhatsApp messages are grouped by chatId into one conversation. The message view uses left/right chat bubbles to distinguish customer and agent messages. The input box supports emoji and media library attachments.
- **WhatsApp Auto Translation**: Optional, disabled by default. Customer messages can be translated into the system language inside the same bubble. Outbound WhatsApp messages can also be translated before sending on a per-number basis. Translation reads from browser cache first, then database cache, then AI only when needed.
- **WhatsApp Actor Hub Mapping**: In a WhatsApp conversation, double-click the `chatId -> mob` field in the `From` area to inline edit the mapping. The mapping is saved to app settings and inbox records.
- **Inbox AI Context & Suggestions**: Run AI analysis once and reuse stored results. Options include Draft AI Reply, Delete Spam, Tag Spam, Mark Important, Tag Follow-up, Assign Sales, Forward, and Sender Manual Analysis where applicable.
- **Email**: IMAP receive and SMTP send profiles support SSL/TLS, STARTTLS, plain connections, TLS certificate verification, and real server-side connection tests.
- **Email Composer**: WYSIWYG email editor, reply/forward flows, signatures, original email preview, and sent mailbox storage.
- **Sales & Quotes**: Manage products, quantity-based pricing tiers, quote drafts, discounts, fees, and product images.
- **AI Agent Center**: Configure agents with a left/right layout, model profile, tools, integrations, workflows, schedules, and human approval mode.
- **Agent Runtime**: Runs real workflow tools, logs execution traces, supports human approvals, duplicate-operation guards, deletion, and clear-log limits.
- **Knowledge Base**: Upload PDF/TXT/DOC/DOCX/CSV files, vectorize documents, and track indexed chunks.
- **Media Library**: Upload and manage images and files. WhatsApp messages can use media assets from this library.
- **Users**: Manage user roles, permissions, and account status.
- **Settings**: Configure theme, language, timezone, notifications, model providers, Email/WhatsApp integrations, vector database, signatures, and Lead Generation Platform API keys.

### Unified Inbox Usage

1. Use **Inbox/Sent** to switch between received and sent conversations.
2. Use the fixed **All / WhatsApp / Email** filter above search to filter by channel.
3. Use checkboxes to select messages, then bulk delete, add tags, mark important, or add follow-up with a due date.
4. Open a WhatsApp conversation to see grouped chat bubbles by chatId.
5. Double-click the `chatId -> mob` field in the `From` area to edit WhatsApp Actor Hub mappings.
6. Use the bottom WhatsApp input box to send text, emoji, images, or files.
7. Enable **Auto translate** when you want customer messages translated into the system language. Translation cache order is browser cache, database cache, then AI.
8. Enable **Translate before sending** for a WhatsApp number when your outbound text should be translated before delivery. The target language is resolved from the customer's preferred language, then the customer's country official language, then English.
9. Run **Analyze** in Agent Context & Suggestions, then use the generated options to process the message efficiently.

### Customer Management Usage

1. Use **My Customers** for owned customer records.
2. Use **Public Pool** for public leads gathered or imported before claiming.
3. Use **List** view for table management.
4. Use **Map** view to see customer/lead distribution on a world map.
5. Click a country on the map or country list to switch back to List view filtered by that country.
6. Use **Import CSV** to import customers or public leads. The modal provides a sample CSV download.

### Model Profiles

Model Profiles are reusable model connection configs. They do not contain agent prompts. Agents select one profile from their configuration.

Supported providers:

- Google Gemini
- OpenAI
- Anthropic
- OpenRouter.ai
- Custom OpenAI-compatible endpoint

OpenRouter uses a free-text model field because it supports many models, for example:

```text
openai/gpt-4o-mini
anthropic/claude-3.5-sonnet
google/gemini-flash-1.5
```

### AI Agents

Each agent can configure:

- Role instructions
- Model Profile
- Available business tools
- Supported Lead Generation Platform integrations
- Executable workflows
- Harness mode: automatic or human-in-the-loop
- Schedule:
  - Every N seconds/minutes/hours/days
  - Or monthly on day N
  - Optional max execution count; `0` means unlimited

When the web app is open, the browser starts the scheduler and writes scheduled runs, trace steps, and approvals to the database. For always-on execution when nobody has the app open, add a server-side worker or cron job using the same database-backed rules.

### Agent Workflows

Current executable workflows include:

- **AI Lead Analysis**: Analyze a public lead and store score, intent, risk, AI analysis, and recommended next action.
- **Lead Generation Platforms**: Uses enabled platform API configuration from Settings and imports real returned leads into Public Pool.
- **Customer Scoring**: Refreshes customer score, intent, risk, and timeline log.
- **Quote Draft**: Creates a draft quote from active products for a selected customer.

Non-repeatable workflows use operation keys, so the same lead/customer is not processed repeatedly while a matching run is pending, running, or completed.

### Lead Generation Platforms

Configure platform credentials in **Settings > Integrations**. Platform settings include API key, auth header, base URL, endpoint path, method, and provider-specific identifiers such as Apify Actor ID or PhantomBuster Agent ID.

Specific search requests are generated by agents from CRM/RAG/product context, not stored as static platform configuration.

### Deployment

The repo includes `.github/workflows/deploy.yml`. It deploys to a VPS on every push to `main`.

Required GitHub Actions secrets:

- `VPS_HOST`
- `VPS_USERNAME`
- `VPS_PRIVATE_KEY`
- `VPS_PORT`
- `PROJECT_PATH`
- `APP_NAME`
- `APP_PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`

The deployment workflow:

1. SSHs into the VPS.
2. Points the deploy directory to the repository that triggered the workflow.
3. Fetches and resets to `origin/main`.
4. Keeps `.env` but removes stale untracked files.
5. Writes runtime environment variables.
6. Runs `npm install`.
7. Runs `npm run build`.
8. Fails fast if legacy prompt UI or stale backend markers are found.
9. Restarts PM2 with `dist/server.cjs`.

### Deployment Verification

After deployment, verify the backend version:

```text
https://your-domain.com/api/deploy-info
```

If the backend marker is old, the server is not running the latest code. If the marker is correct but the UI still looks old, clear CDN/reverse-proxy/browser cache for the frontend bundle.

---

## 中文使用说明

### 本地开发

```bash
npm install
npm run dev
```

启动后打开终端输出的本地地址，通常是：

```text
http://localhost:3000
```

### 默认登录账号

登录依赖 PostgreSQL。当配置了 `DATABASE_URL` 或 `PG_VECTOR_URL` 后，服务端首次启动会初始化默认账号：

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### 环境变量

可以基于 `.env.example` 创建 `.env`：

```text
PORT=3000
DATABASE_URL=postgresql://...
PG_VECTOR_URL=postgresql://...
JWT_SECRET=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
```

`DATABASE_URL` 用于保存 CRM 业务数据。`PG_VECTOR_URL` 用于知识库向量化。如果 GitHub Actions 自动部署时只配置了 `DATABASE_URL`，可以在部署脚本中将 `PG_VECTOR_URL` 设置为同一个值。

### 数据持久化

业务数据保存到 PostgreSQL，不再只保存在浏览器。前端 localStorage 仅作为缓存或请求失败时的 fallback。

数据库持久化覆盖：

- 客户和 Public Pool 线索
- 统一收件箱 Email/WhatsApp 消息
- WhatsApp chatId 到 mob 的映射
- WhatsApp 消息翻译缓存
- WhatsApp 按号码保存的接收消息自动翻译和发送前自动翻译偏好
- 模型 Profiles
- 智能体、运行日志、追踪步骤和人工审批
- 系统用户
- 应用设置
- 媒体素材记录
- 邮件收信/发信配置、账号映射和签名

### 主要功能

- **仪表盘**：CRM 指标、未读消息、预计收入、待处理工作，以及类似 GitHub Contributions 的事件图表。
- **客户管理**：创建、编辑、删除、搜索、标签管理、CSV 导入、Public Pool 线索领取，并支持 List/Map 视图。Map 视图显示世界地图、国家数量，并支持点击国家筛选列表。
- **统一收件箱**：集中管理 Email 和 WhatsApp 会话。支持 Inbox/Sent、固定 All/WhatsApp/Email 渠道筛选、搜索、批量删除、批量加标签、批量加入跟进并设置到期时间、标记重要、删除、同步、负责人、内部评论和 AI 分析。
- **WhatsApp 会话**：按 chatId 聚合同一个聊天窗口。消息气泡会区分我方和客户：我方靠右，客户靠左。输入框支持 emoji 和媒体素材库附件。
- **WhatsApp 自动翻译**：可选功能，默认关闭。客人的非系统语言消息可在同一个气泡内翻译为系统语言；我方发送 WhatsApp 时也可以按号码开启发送前自动翻译。翻译读取顺序为浏览器缓存、数据库缓存，最后才调用 AI。
- **WhatsApp Actor Hub 映射**：在 WhatsApp conversation 的 `From` 区域双击 `chatId -> mob` 字段，可 inline edit 映射关系。映射会保存到应用设置和 inbox 记录。
- **智能体上下文与建议**：AI 分析结果会保存并复用。Options 包含 Draft AI Reply、Delete Spam、Tag Spam、Mark Important、Tag Follow-up、Assign Sales、Forward、Sender Manual Analysis 等。
- **邮件集成**：IMAP 收信和 SMTP 发信支持 SSL/TLS、STARTTLS、无加密连接、TLS 证书校验，以及真实服务端连接测试。
- **写信/回信**：支持 WYSIWYG 邮件编辑器、回复/转发、邮件签名、原邮件预览和发件箱保存。
- **销售与报价**：管理产品、数量阶梯价格、报价草稿、折扣、费用和产品图片。
- **智能体中心**：左右列配置智能体，可配置模型 Profile、工具、集成、工作流、执行周期和人工审批模式。
- **智能体运行**：执行真实工作流工具，记录运行日志和追踪步骤，支持人工审批、防重复执行、删除和清空日志。
- **知识库**：上传 PDF/TXT/DOC/DOCX/CSV 文件，执行向量化并查看知识切片数量。
- **媒体素材库**：上传和管理图片/文件，WhatsApp 消息可从媒体素材库选择附件。
- **用户管理**：管理用户角色、权限和账号状态。
- **系统设置**：配置主题、语言、时区、通知、模型服务商、Email/WhatsApp 集成、向量数据库、邮件签名和获客平台 API Key。

### 统一收件箱使用

1. 使用 **Inbox/Sent** 切换收件箱和发件箱。
2. 使用搜索框上方固定的 **All / WhatsApp / Email** 筛选渠道。
3. 勾选消息后，可以批量删除、批量加标签、标记重要，或加入跟进并设置到期时间。
4. 打开 WhatsApp 会话后，可以查看按 chatId 聚合的聊天记录。
5. 在 `From` 区域双击 `chatId -> mob` 字段，可以编辑 WhatsApp Actor Hub 映射。
6. 使用底部 WhatsApp 输入框发送文字、emoji、图片或文件。
7. 需要翻译客户消息时开启 **自动翻译**。翻译缓存读取顺序为浏览器缓存、数据库缓存，最后才调用 AI。
8. 需要将我方输入内容翻译后再发送时，为当前 WhatsApp 号码开启 **发送前自动翻译**。目标语言优先使用客户偏好语言，其次使用客户国家官方语言，最后 fallback 为英文。
9. 在“智能体上下文与建议”里点击 Analyze 分析消息，再使用 Options 快速处理。

### 客户管理使用

1. **My Customers** 用于管理已拥有客户。
2. **Public Pool** 用于管理待领取的公共线索。
3. **List** 视图用于表格管理。
4. **Map** 视图用于查看客户/线索在世界地图上的分布。
5. 点击地图上的国家点或右侧国家列表，会自动切回 List 并筛选该国家。
6. 使用 **Import CSV** 导入客户或公共线索，弹窗中提供示例 CSV 下载。

### 模型 Profiles

模型 Profile 是可复用的模型连接配置，不包含智能体 prompt。智能体在配置中选择一个 Profile 使用。

支持的服务商：

- Google Gemini
- OpenAI
- Anthropic
- OpenRouter.ai
- 自定义 OpenAI-compatible 接口

OpenRouter 支持大量模型，因此模型名称使用文本框手动输入，例如：

```text
openai/gpt-4o-mini
anthropic/claude-3.5-sonnet
google/gemini-flash-1.5
```

### AI 智能体

每个智能体可以配置：

- 角色说明
- 模型 Profile
- 可用业务工具
- 可用获客平台集成
- 可执行工作流
- 执行模式：自动或人工审批
- 执行周期：
  - 每隔 N 秒/分钟/小时/天
  - 或每月第 N 日
  - 可选最大执行次数，`0` 表示无限制

当 Web 应用打开时，浏览器会启动调度器，并将定时运行、追踪步骤和审批写入数据库。如果需要无人打开应用时也持续执行，需要增加服务端 worker 或 cron job，复用同一套数据库规则。

### 智能体工作流

当前可执行工作流包括：

- **AI Lead Analysis**：分析 Public Pool 线索，并保存 score、intent、risk、AI analysis 和推荐动作。
- **Lead Generation Platforms**：使用设置中启用的平台 API 配置，将真实返回的线索导入 Public Pool。
- **Customer Scoring**：刷新客户 score、intent、risk 和时间线日志。
- **Quote Draft**：基于有效产品为指定客户创建报价草稿。

不可重复执行的工作流使用 operation key，避免同一个 lead/customer 在 pending、running 或 completed 状态下被重复处理。

### Lead Generation Platforms

在 **Settings > Integrations** 中配置平台凭证。平台配置包含 API key、认证 header、base URL、endpoint path、method，以及 Apify Actor ID 或 PhantomBuster Agent ID 等平台字段。

具体搜索请求由智能体根据 CRM/RAG/产品上下文生成，不作为静态平台配置保存。

### 自动部署

仓库包含 `.github/workflows/deploy.yml`，推送到 `main` 后会自动部署到 VPS。

需要配置的 GitHub Actions Secrets：

- `VPS_HOST`
- `VPS_USERNAME`
- `VPS_PRIVATE_KEY`
- `VPS_PORT`
- `PROJECT_PATH`
- `APP_NAME`
- `APP_PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`

部署流程：

1. SSH 到 VPS。
2. 将部署目录指向触发 workflow 的仓库。
3. fetch 并 reset 到 `origin/main`。
4. 保留 `.env`，清理旧的未跟踪文件。
5. 写入运行环境变量。
6. 执行 `npm install`。
7. 执行 `npm run build`。
8. 如果发现旧版 prompt UI 或旧 backend marker，则中止部署。
9. 使用 `dist/server.cjs` 重启 PM2。

### 部署验证

部署后访问：

```text
https://your-domain.com/api/deploy-info
```

如果 backend marker 仍是旧的，说明服务端没有运行最新代码。如果 marker 正确但 UI 仍旧，通常是 CDN、反向代理或浏览器缓存了旧前端 bundle。
