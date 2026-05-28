# AgentCRM

AgentCRM is an AI-assisted CRM built with React, Vite, Express, and PostgreSQL/pgvector support. It includes customer management, unified inbox, sales quotes, products, media library, knowledge base vectorization, AI agent workflows, user management, and system settings.

AgentCRM 是一个基于 React、Vite、Express，并支持 PostgreSQL/pgvector 的 AI CRM 系统。系统包含客户管理、统一收件箱、销售报价、产品库、媒体库、知识库向量化、AI 智能体工作流、用户管理和系统设置。

---

## English Usage Guide

### Local Development

```bash
npm install
npm run dev
```

Open the printed local URL in your browser, usually:

```text
http://localhost:3000
```

### Default Login

Authentication requires PostgreSQL. When `DATABASE_URL` or `PG_VECTOR_URL` is configured, the server seeds these default accounts on first run:

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### Main Features

- **Dashboard**: CRM metrics, unread inbox count, estimated revenue, pending work, and a GitHub-style user event contribution chart.
- **Inbox**: Manage Email and WhatsApp conversations, delete messages, draft AI replies, tag conversations, assign owners, and add internal comments.
- **Customers**: Create, edit, delete, search, tag, and claim public leads into customer records.
- **Customer Detail**: Review AI insights, activity timeline, profile memory, internal discussion, and AI proposal drafts.
- **Sales & Quotes**: Manage products, tiered pricing, quote drafts, discounts, fees, and product images.
- **AI Agent Center**: Configure agents in a left/right layout, assign tools, integrations, model profiles, executable workflows, execution schedule, and human approval mode.
- **Agent Runtime**: Runs real workflow tools such as AI Lead Analysis, Customer Scoring, and Quote Draft. Agent run logs and trace steps can be deleted.
- **Knowledge Base**: Upload PDF/TXT/DOC/DOCX/CSV files, vectorize documents, and track indexed knowledge chunks.
- **Media Library**: Upload images, videos, and files with drag-and-drop.
- **Users**: Manage roles, permissions, account status, and safe user deletion.
- **Settings**: Configure theme, language, timezone, notifications, model profiles, Email/WhatsApp integrations, vector database, and Lead Generation Platform API keys.

### AI Agents

Each agent can be configured with:

- Role instructions
- Model profile
- Available business tools
- Supported Lead Generation Platform integrations
- Executable workflows
- Harness mode: auto-execute or human-in-the-loop approval
- Execution schedule:
  - Every N seconds/minutes/hours/days
  - Or monthly on day N
  - Optional maximum execution count, where `0` means unlimited

The schedule is currently stored as configuration. A background scheduler still needs to be connected before agents run automatically by time.

### Agent Workflows

Current executable workflows include:

- **AI Lead Analysis**: Analyzes a real public lead and stores score, intent, risk, AI analysis, and recommended next action.
- **Lead Generation Platforms**: Uses enabled platform configuration from Settings. It does not create mock leads. A real platform API worker must be connected to import returned leads.
- **Customer Scoring**: Refreshes a customer score, intent, risk, and timeline log.
- **Quote Draft**: Creates a draft quote from active products for a selected customer.

Non-repeatable workflows are guarded by operation key, so the same lead/customer is not processed repeatedly for the same non-repeatable action while a run is pending, running, or completed.

### Model Profiles

Agents use the model profile selected on the agent. Profiles are reusable and do not contain agent prompts. Supported providers:

- Google Gemini
- OpenAI
- Anthropic
- OpenRouter.ai
- Custom OpenAI-compatible endpoint

OpenRouter uses a free-text model name because OpenRouter has many models. Example:

```text
openai/gpt-4o-mini
anthropic/claude-3.5-sonnet
google/gemini-flash-1.5
```

### Optional Environment Variables

Create a `.env` file from `.env.example` and configure values as needed:

```text
PORT=3000
DATABASE_URL=postgresql://...
PG_VECTOR_URL=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
JWT_SECRET=...
```

A model profile can store its own API key in Settings, or it can use the matching server secret such as `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`.

---

## 中文使用说明

### 本地开发

```bash
npm install
npm run dev
```

启动后在浏览器打开终端输出的本地地址，通常是：

```text
http://localhost:3000
```

### 默认登录

系统登录依赖 PostgreSQL。当配置了 `DATABASE_URL` 或 `PG_VECTOR_URL` 后，服务端首次启动会初始化默认账号：

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### 主要功能

- **仪表盘**：查看 CRM 指标、未读消息、预估收入、待处理工作，以及类似 GitHub Contributions 的用户事件图。
- **统一收件箱**：管理 Email 和 WhatsApp 会话，支持删除消息、AI 回复草稿、标签、负责人和内部评论。
- **客户管理**：创建、编辑、删除、搜索、标签管理客户，并可将公共线索领取为客户。
- **客户详情**：查看 AI 洞察、活动时间线、客户记忆、内部讨论和 AI 方案草稿。
- **销售与报价**：管理产品、数量阶梯价格、报价草稿、折扣、费用和产品图片。
- **智能体中心**：左侧显示 Agent 队列，右侧直接显示配置界面，可配置工具、集成、模型 Profile、工作流、执行周期和审批模式。
- **智能体运行时**：支持真实工作流工具，例如 AI Lead Analysis、Customer Scoring、Quote Draft。运行日志和追踪步骤支持删除。
- **知识库**：上传 PDF/TXT/DOC/DOCX/CSV 文件，执行向量化，并查看知识切片数量。
- **媒体库**：拖拽上传图片、视频和文件。
- **用户管理**：管理用户角色、权限、账号状态和安全删除。
- **系统设置**：配置主题、语言、时区、通知、模型 Profile、Email/WhatsApp 集成、向量数据库和获客平台 API Key。

### 智能体配置

每个智能体可以配置：

- 角色说明 / 执行指令
- 模型 Profile
- 可用业务工具
- 可使用的 Lead Generation Platform 集成
- 可执行工作流
- 执行护栏：自动执行或人工审批
- 执行周期：
  - 每隔 N 秒 / 分 / 小时 / 天
  - 或每月第 N 日
  - 可配置执行次数，`0` 表示不限次数

当前执行周期已经作为配置保存。真正按时间自动触发智能体，还需要继续接入后台调度器。

### 智能体工作流

当前可执行工作流包括：

- **AI Lead Analysis**：对真实公共线索进行 AI 分析，写入评分、意向、风险、AI 分析摘要和下一步建议。
- **Lead Generation Platforms**：读取系统设置中已启用的获客平台配置。它不会再生成 mock 线索；需要接入真实平台 API worker 后，才能把平台返回数据导入公共线索池。
- **Customer Scoring**：刷新客户评分、意向、风险，并写入客户时间线。
- **Quote Draft**：基于启用产品为客户创建报价草稿。

系统会对不应重复的工作流做防重复保护。同一个 lead/customer 在已有运行中、待审批或已完成的同类操作时，不会被重复执行。

### 模型 Profile

智能体使用绑定的模型 Profile。Profile 是可复用的模型连接配置，不包含智能体 prompt。支持：

- Google Gemini
- OpenAI
- Anthropic
- OpenRouter.ai
- 自定义 OpenAI-compatible 接口

OpenRouter 模型很多，因此模型名称使用文本框手动输入，例如：

```text
openai/gpt-4o-mini
anthropic/claude-3.5-sonnet
google/gemini-flash-1.5
```

### 可选环境变量

可基于 `.env.example` 创建 `.env` 文件：

```text
PORT=3000
DATABASE_URL=postgresql://...
PG_VECTOR_URL=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
JWT_SECRET=...
```

模型 Profile 可以在 Settings 中单独保存 API Key，也可以使用服务器环境变量，例如 `GEMINI_API_KEY`、`OPENAI_API_KEY`、`OPENROUTER_API_KEY` 或 `ANTHROPIC_API_KEY`。

---

## Production Deployment to VPS via GitHub Actions

This project includes a deployment workflow in `.github/workflows/deploy.yml`. It builds and deploys the app to your VPS whenever changes are pushed to `main`.

### Prerequisites

1. Node.js 18+
2. npm
3. PM2
4. Git

### GitHub Secrets

Add these in **Settings > Secrets and variables > Actions**:

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

`DATABASE_URL` is also written to `PG_VECTOR_URL` by the deployment script, so vector configuration can reuse the same database URL.

### Deployment Flow

The workflow:

1. SSHs into the VPS.
2. Sets the deployment repository to the GitHub repo that triggered the workflow.
3. Fetches and resets to `origin/main`.
4. Cleans stale untracked files while keeping `.env`.
5. Writes runtime environment variables.
6. Runs `npm install`.
7. Runs `npm run build`.
8. Fails fast if legacy browser prompt UI is found in the built assets.
9. Restarts PM2 from `dist/server.cjs`.
