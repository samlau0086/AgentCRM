# AgentCRM

AgentCRM is an AI-assisted CRM built with React, Vite, Express, and PostgreSQL/pgvector. It includes customer management, unified Email/WhatsApp inbox, sales quotes, products, media library, knowledge base vectorization, AI agent workflows, user management, and system settings.

AgentCRM 是一个基于 React、Vite、Express 和 PostgreSQL/pgvector 的 AI CRM 系统，包含客户管理、统一 Email/WhatsApp 收件箱、销售报价、产品库、媒体库、知识库向量化、AI 智能体工作流、用户管理和系统设置。

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

`DATABASE_URL` stores CRM data. `PG_VECTOR_URL` is used by the vector knowledge base. In the GitHub Actions deployment script, `PG_VECTOR_URL` is automatically set to `DATABASE_URL` when only `DATABASE_URL` is provided.

### Data Persistence

Business data is stored in PostgreSQL, not only in the browser. The frontend keeps local storage only as a fallback/cache layer.

Database-first sync is used for:

- Customers and Public Pool leads
- Unified inbox messages
- Model Profiles
- Agents, agent runs, trace steps, and approvals
- System users
- App settings
- Media records
- Email receive/send profiles, mappings, and signatures

Pages use a shared sync pattern: load from server first, fall back to cache only on request failure, listen for local `crm:data-changed` events, and periodically refresh without re-rendering when data is unchanged.

### Main Features

- **Dashboard**: CRM metrics, unread messages, estimated revenue, pending work, and a GitHub-style contribution chart.
- **Unified Inbox**: Manage Email and WhatsApp conversations, delete messages, sync messages, tag conversations, assign owners, add internal comments, and run AI context analysis.
- **WhatsApp Chat**: The WhatsApp send button opens a chat-style interface. You can choose a customer with `@name`, view sent/received WhatsApp history for that number, and send new messages through WhatsApp Actor Hub.
- **Email**: IMAP receive and SMTP send profiles support SSL/TLS, STARTTLS, plain connections, TLS certificate verification, and real server-side connection tests.
- **Customers**: Create, edit, delete, search, tag, and import customers by CSV. Public leads can be claimed into customer records.
- **Customer Detail**: View AI insights, timeline, memory, internal discussion, and AI proposal drafts using real CRM data.
- **Sales & Quotes**: Manage products, quantity-based pricing tiers, quote drafts, discounts, fees, and product images.
- **AI Agent Center**: Configure agents with a left/right layout, model profile, tools, integrations, workflows, schedules, and human approval mode.
- **Agent Runtime**: Runs real workflow tools, logs execution traces, supports human approvals, duplicate-operation guards, deletion, and clear-log limits.
- **Knowledge Base**: Upload PDF/TXT/DOC/DOCX/CSV files, vectorize documents, and track indexed chunks.
- **Media Library**: Upload and manage media assets.
- **Users**: Manage user roles, permissions, and account status.
- **Settings**: Configure theme, language, timezone, notifications, model providers, Email/WhatsApp integrations, vector database, and Lead Generation Platform API keys.

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
- **Lead Generation Platforms**: Uses enabled platform API configuration from Settings and imports real returned leads into Public Pool. It does not create mock leads.
- **Customer Scoring**: Refreshes customer score, intent, risk, and timeline log.
- **Quote Draft**: Creates a draft quote from active products for a selected customer.

Non-repeatable workflows use operation keys, so the same lead/customer is not processed repeatedly while a matching run is pending, running, or completed.

### Lead Generation Platforms

Configure platform credentials in **Settings > Integrations**. Platform settings should include API key, auth header, base URL, endpoint path, method, and provider-specific identifiers such as Apify Actor ID or PhantomBuster Agent ID.

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
5. Writes runtime environment variables, including `BUILD_SHA`, `BUILD_TIME`, and `DEPLOY_REPOSITORY`.
6. Runs `npm install`.
7. Runs `npm run build`.
8. Fails fast if legacy prompt UI or stale backend markers are found.
9. Restarts PM2 with `dist/server.cjs`.

### Deployment Verification

After deployment, verify the backend version:

```text
https://your-domain.com/api/deploy-info
```

Expected fields:

```json
{
  "marker": "crm-db-sync-v2-record-upsert-polling",
  "gitSha": "...",
  "buildTime": "...",
  "repository": "..."
}
```

If the marker is missing, the server is not running the latest code. If the marker is correct but the UI still looks old, clear CDN/reverse-proxy/browser cache for the frontend bundle.

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

### 默认登录

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

`DATABASE_URL` 用于保存 CRM 业务数据。`PG_VECTOR_URL` 用于知识库向量化。GitHub Actions 自动部署脚本会在只配置 `DATABASE_URL` 时，把 `PG_VECTOR_URL` 设置为同一个值。

### 数据持久化

业务数据保存到 PostgreSQL，不再只保存在浏览器前端。浏览器本地存储只作为 fallback/cache。

数据库优先同步已覆盖：

- 客户和 Public Pool 线索
- 统一收件箱消息
- 模型 Profile
- 智能体、运行日志、追踪步骤、人工审批
- 系统用户
- 系统设置
- 媒体记录
- 邮箱收信/发信配置、账号映射、邮件签名

页面使用统一同步机制：优先从服务端加载，请求失败才使用本地缓存；监听本窗口 `crm:data-changed` 事件；并定时跨浏览器刷新。数据没有变化时不会重新渲染，避免审批列表闪烁。

### 主要功能

- **仪表盘**：CRM 指标、未读消息、预计收入、待处理工作，以及类似 GitHub Contributions 的事件图表。
- **统一收件箱**：管理 Email 和 WhatsApp 会话，支持删除、同步、标签、负责人、内部评论和 AI 上下文分析。
- **WhatsApp 聊天**：点击 WhatsApp 发送按钮会打开聊天式界面。可以用 `@客户名` 选择客户，查看该号码的收发历史，并通过 WhatsApp Actor Hub 继续发送消息。
- **邮箱集成**：IMAP 收信和 SMTP 发信支持 SSL/TLS、STARTTLS、无加密连接、TLS 证书校验，以及真实服务端连接测试。
- **客户管理**：创建、编辑、删除、搜索、标签管理客户，支持 CSV 导入，并可将 Public Pool 线索领取为客户。
- **客户详情**：基于真实 CRM 数据查看 AI 洞察、活动时间线、客户记忆、内部讨论和 AI 方案草稿。
- **销售与报价**：管理产品、数量阶梯价格、报价草稿、折扣、费用和产品图片。
- **智能体中心**：左右列配置智能体，可配置模型 Profile、工具、集成、工作流、执行周期和人工审批模式。
- **智能体运行**：执行真实工作流工具，记录运行日志和追踪步骤，支持人工审批、防重复执行、删除和清空日志。
- **知识库**：上传 PDF/TXT/DOC/DOCX/CSV 文件，执行向量化并查看知识切片数量。
- **媒体库**：上传和管理媒体资源。
- **用户管理**：管理用户角色、权限和账号状态。
- **系统设置**：配置主题、语言、时区、通知、模型服务商、Email/WhatsApp 集成、向量数据库和获客平台 API Key。

### 模型 Profile

模型 Profile 是可复用的模型连接配置，不包含智能体 Prompt。智能体在配置中选择一个 Profile 使用。

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

### 智能体

每个智能体可配置：

- 角色说明
- 模型 Profile
- 可用业务工具
- 可用获客平台集成
- 可执行工作流
- 执行护栏：自动执行或人工审批
- 执行周期：
  - 每隔 N 秒/分钟/小时/天
  - 或每月第 N 日
  - 可选最大执行次数；`0` 表示无限制

当网页打开且用户已登录时，浏览器会启动调度器，并把定时运行、追踪步骤和审批记录写入数据库。如果需要无人打开网页时也持续执行，应增加服务端 worker 或 cron，并基于同一套数据库规则执行。

### 智能体工作流

当前可执行工作流包括：

- **AI Lead Analysis**：分析真实 Public Pool 线索，并写入评分、意向、风险、AI 分析和下一步建议。
- **Lead Generation Platforms**：读取设置中已启用的平台 API 配置，将真实返回线索导入 Public Pool，不再生成 mock 数据。
- **Customer Scoring**：刷新客户评分、意向、风险，并写入客户时间线。
- **Quote Draft**：基于启用产品为指定客户创建报价草稿。

不应重复执行的工作流会使用 operation key 防重复。同一个 lead/customer 已有待审批、运行中或已完成的同类操作时，不会重复执行。

### 获客平台配置

在 **Settings > Integrations** 中配置平台凭据。平台配置只保存 API Key、认证 Header、Base URL、Endpoint Path、Method，以及 Apify Actor ID、PhantomBuster Agent ID 等平台标识。

具体搜索请求由智能体根据 CRM/RAG/产品上下文生成，不作为静态平台配置保存。

### 自动部署

项目包含 `.github/workflows/deploy.yml`，推送到 `main` 后会自动部署到 VPS。

需要配置 GitHub Actions Secrets：

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

1. SSH 连接 VPS。
2. 将部署目录的 git remote 指向触发 workflow 的仓库。
3. 拉取并重置到 `origin/main`。
4. 保留 `.env`，清理旧的未跟踪文件。
5. 写入运行环境变量，包括 `BUILD_SHA`、`BUILD_TIME`、`DEPLOY_REPOSITORY`。
6. 执行 `npm install`。
7. 执行 `npm run build`。
8. 如果构建产物中发现旧 prompt UI 或旧后端标记，会中止部署。
9. 使用 PM2 重启 `dist/server.cjs`。

### 部署验证

部署后访问：

```text
https://your-domain.com/api/deploy-info
```

应看到：

```json
{
  "marker": "crm-db-sync-v2-record-upsert-polling",
  "gitSha": "...",
  "buildTime": "...",
  "repository": "..."
}
```

如果没有该 marker，说明服务端不是最新代码。如果 marker 正确但界面仍旧，优先检查 CDN、反向代理或浏览器缓存。
