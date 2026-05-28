# CRM System

This is an AI-assisted CRM system built with React, Vite, Express, and PostgreSQL/pgvector support. It includes customer management, unified inbox, sales quotes, media library, knowledge base vectorization, AI agent workflows, user management, and system settings.

这是一个基于 React、Vite、Express，并支持 PostgreSQL/pgvector 的 AI 智能 CRM 系统。系统包含客户管理、统一收件箱、销售报价、媒体库、知识库向量化、AI Agent 工作流、用户管理和系统设置等模块。

---

## English Usage Guide

### Local Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open the printed local URL in your browser, usually:

```text
http://localhost:3000
```

### Default Login

The app requires PostgreSQL for authentication. When `DATABASE_URL` or `PG_VECTOR_URL` is configured, default seeded accounts use this initial password:

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### Main Features

- **Dashboard**: View CRM metrics, unread inbox items, revenue estimates, and pending work.
- **Inbox**: Manage Email and WhatsApp conversations, draft AI replies, send or schedule messages, add tags, assign conversations, and leave internal comments.
- **Customers**: Create, edit, delete, search, and tag customers. Configure preferred customer language for outbound AI content.
- **Customer Detail**: Review AI insights, activity timeline, profile memory, internal discussion, and generate AI proposal drafts.
- **Sales & Quotes**: Manage products, attach product images from the media library, create quotes, add discounts and fees, and safely delete products or quotes.
- **AI Agent Center**: Configure agents, toggle status, trigger test runs, inspect trace logs, and approve or reject human-in-the-loop actions.
- **Knowledge Base**: Upload PDF/TXT/DOC/DOCX/CSV files, vectorize documents, and track indexed knowledge chunks.
- **Media Library**: Upload images, videos, and files with drag-and-drop. Use uploaded images in product records.
- **Users**: Manage roles, permissions, account status, and safe user deletion.
- **Settings**: Configure theme, language, timezone, notifications, AI model settings, Email/WhatsApp integrations, vector database, and lead-generation platform API keys.

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

Agent execution uses the model profile selected on each agent. A profile can store its own API key in Settings, or it can use the matching server secret such as `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`. `GEMINI_MODEL` is optional; the server defaults to `gemini-1.5-flash`.

---

## 中文使用说明

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

启动后在浏览器中打开终端输出的本地地址，通常是：

```text
http://localhost:3000
```

### 默认登录

系统需要 PostgreSQL 才能登录。如果配置了 `DATABASE_URL` 或 `PG_VECTOR_URL`，系统会自动初始化默认账号，初始密码是：

```text
admin@acmecorp.com / password
alice@acmecorp.com / password
charlie@acmecorp.com / password
```

### 主要功能

- **仪表盘**：查看 CRM 指标、未读消息、收入预估和待处理工作。
- **收件箱**：统一管理 Email 和 WhatsApp 会话，支持 AI 回复草稿、发送/定时发送、标签、分配负责人和内部评论。
- **客户管理**：新增、编辑、删除、搜索和标记客户；可设置客户首选语言，用于对外 AI 内容生成。
- **客户详情**：查看 AI 洞察、活动时间线、客户记忆、内部讨论，并生成 AI 销售方案草稿。
- **销售与报价**：管理产品库，为产品选择媒体库图片，创建报价单，添加折扣和附加费用，并通过确认弹窗安全删除。
- **AI Agent 中心**：配置智能代理、切换状态、触发测试运行、查看执行日志，并审批或拒绝需要人工确认的动作。
- **知识库**：上传 PDF/TXT/DOC/DOCX/CSV 文件，执行向量化处理，并查看知识切片数量。
- **媒体库**：拖拽上传图片、视频和文件；上传后的图片可用于产品资料。
- **用户管理**：管理用户角色、权限、账号状态，并支持安全删除。
- **系统设置**：配置主题、语言、时区、通知、AI 模型、Email/WhatsApp 集成、向量数据库和获客平台 API Key。

### 可选环境变量

可以基于 `.env.example` 创建 `.env` 文件，并按需配置：

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

如果未配置 `GEMINI_API_KEY`，AI 接口会返回配置错误，不会生成模拟内容。

## Production Deployment to VPS via GitHub Actions

This project includes a fully automated deployment pipeline using GitHub Actions (`.github/workflows/deploy.yml`). It automatically builds and deploys the application to your own VPS whenever you push changes to the `main` branch.

### Prerequisites

You need a VPS with the following installed and configured:
1. Node.js (v18+)
2. npm
3. PM2 (`npm install -g pm2`) for process management
4. Git

### Setup Instructions

1. Go to your GitHub repository: **Settings > Secrets and variables > Actions > New repository secret**.
2. Add the following Secrets:

* `VPS_HOST`: Your VPS IP address or domain name (e.g., `123.45.67.89`)
* `VPS_USERNAME`: Your VPS SSH login username (e.g., `root`, `ubuntu`)
* `VPS_PRIVATE_KEY`: Your SSH private key (starts with `-----BEGIN...`)
* `VPS_PORT`: Your SSH port (usually `22`)
* `PROJECT_PATH`: The absolute path to your cloned repository on the VPS (e.g., `/var/www/my-crm`)
* `APP_NAME`: The name you want to use for the PM2 process (e.g., `crm-app`)
* `APP_PORT`: The port your app should run on under the VPS (e.g., `3005`)
* `DATABASE_URL`: Required for authentication and persistent CRM data.
* `GEMINI_API_KEY`: Required for Agent execution and AI generation endpoints.
* `GEMINI_MODEL`: Optional Gemini model override. Defaults to `gemini-1.5-flash`.
* `OPENAI_API_KEY`: Optional server-side fallback for OpenAI/custom-compatible model profiles.
* `OPENROUTER_API_KEY`: Optional server-side fallback for OpenRouter.ai model profiles.
* `ANTHROPIC_API_KEY`: Optional server-side fallback for Anthropic model profiles.
* `JWT_SECRET`: (Optional) Secret key for JWT encryption.

### How it Works

Once the secrets are configured, any code push to the `main` branch will trigger the workflow. The Action will:
1. SSH into your VPS.
2. Navigate to your `PROJECT_PATH` (creates it and clones the repo if it doesn't exist).
3. Pull the latest code from `main`.
4. Update the `.env` file with the `APP_PORT`, `DATABASE_URL`, model-provider keys, and `JWT_SECRET` (if configured in GitHub Secrets).
5. Install npm dependencies (`npm install`).
6. Build the full-stack project (`npm run build`).
7. Reload or start the PM2 process for your application.

### Important Note about Database
The deployment script now automatically reads `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, and `JWT_SECRET` from your GitHub Secrets and sets them in the `.env` file on your VPS. Just ensure they are correctly added into your GitHub Secrets settings as described above.
