# AgentCRM Roadmap

Last updated: 2026-06-15

This roadmap is used to keep implementation progress visible across iterations.

本路线图用于持续记录 AgentCRM 的实现进度，方便后续按模块继续推进。

## Status Legend / 状态说明

- `[x] Done / 已完成`
- `[~] In progress / 进行中`
- `[ ] Planned / 计划中`

## Current Focus / 当前重点

- [x] Move core CRM data from browser-only storage to database-backed records.
- [x] Improve high-volume Customer/Public Pool/Product list performance with pagination.
- [x] Add batch operations for Customers, Public Pool, Inbox, Products, and Agent logs.
- [~] Optimize high-volume CSV imports and bulk mutations so large datasets remain responsive. Public Pool import now uses a server-side job first pass.
- [~] Continue replacing mock/demo flows with real integrations and database-backed behavior.

---

## 1. Data Persistence / 数据持久化

- [x] Customers are loaded from and saved to PostgreSQL-backed CRM records.
- [x] Public Pool leads are loaded from and saved to PostgreSQL-backed CRM records.
- [x] Products are loaded from and saved to PostgreSQL-backed CRM records.
- [x] Inbox Email/WhatsApp messages are database-backed.
- [x] Model profiles, agents, agent runs, trace steps, approvals, users, settings, media, email profiles, signatures, and mappings are database-backed.
- [x] Product records no longer store large WooCommerce payloads in browser `localStorage`.
- [x] Product local cache uses memory cache to avoid browser quota errors.
- [x] Bulk delete API added for CRM records to avoid slow per-record delete loops.
- [~] Add server-side pagination/query APIs for very large datasets, beyond current frontend pagination. First pass added for Customers, Public Pool, Products, and Unified Inbox; normalized global country stats API added for Customer Map.
- [ ] Add database indexes for frequently queried CRM record entities and JSON fields where needed.

## 2. Customer Management / 客户管理

- [x] My Customers list view.
- [x] Public Pool list view.
- [x] CSV import for My Customers and Public Pool.
- [x] Sample CSV download in import modal.
- [x] My Customers and Public Pool pagination.
- [x] My Customers multi-select and bulk delete.
- [x] Public Pool admin-only multi-select and bulk delete.
- [x] Bulk delete now uses a single backend `bulk-delete` request.
- [x] Public Pool large CSV import runs in batches of 100.
- [x] Public Pool large CSV import has progress modal.
- [x] Public Pool large CSV import supports retry and skip after failed batches.
- [x] Public Pool batch import reduces write concurrency to improve stability.
- [x] Customer contact methods are visible in list/detail pages.
- [x] Customer WhatsApp and Email actions deep-link to Unified Inbox compose flows.
- [x] Customer Map view added with SVG world map and country filtering.
- [x] Customer/Public Pool Map view uses server-side country counts instead of current-page-only records.
- [x] Server-side country normalization added for ISO2 codes, aliases, accented names, and common city/state hints.
- [~] Continue performance tuning for 8k+ lead imports and bulk operations.
- [x] Public Pool CSV import uses a server-side job with progress polling.
- [x] Public Pool CSV import has server-side batch retry and skip-after-retries behavior.
- [x] Public Pool CSV import supports failed-row CSV download.
- [x] Public Pool import history view added to the CSV import modal.
- [x] Public Pool failed-row retry creates a new backend import job.
- [x] My Customers CSV import uses the same server-side job, progress, history, failed-row download, and retry pattern.
- [x] Broader import history page added with type/status filters, failed-row actions, delete, and retention pruning.

## 3. Sales, Products & Quotes / 产品与报价

- [x] Products list with database-backed storage.
- [x] Products pagination.
- [x] Product multi-select and bulk delete.
- [x] Product quantity tier pricing.
- [x] WooCommerce product import.
- [x] WooCommerce import supports start page, page count, per-page size, and next-page progress.
- [x] WooCommerce import supports product `slug`.
- [x] Product link field added.
- [x] WooCommerce final product link can be generated as `Product Base URL + slug`.
- [x] Product edit modal supports Product Link.
- [x] Product list shows clickable product links.
- [x] Add first-pass server-side product pagination/search for large catalogs.
- [ ] Add WooCommerce import retry/skip progress similar to Public Pool CSV import.
- [ ] Add product import conflict review before overwrite.

## 4. Unified Inbox / 统一收件箱

- [x] Email and WhatsApp unified inbox.
- [x] Inbox/Sent views.
- [x] Fixed WhatsApp/Email filter above search.
- [x] Bulk message actions: delete, tag, mark important, follow-up with due date.
- [x] Email delete and sent mailbox storage.
- [x] WYSIWYG email compose/reply/forward.
- [x] Email signatures and default signature selection.
- [x] IMAP sync and SMTP send profiles.
- [x] IMAP/SMTP SSL/TLS/STARTTLS settings and real connection tests.
- [x] WhatsApp conversations grouped by chatId.
- [x] WhatsApp chat bubbles distinguish agent/customer direction.
- [x] WhatsApp input supports emoji and media library attachments.
- [x] WhatsApp chatId to mobile mapping with inline edit.
- [x] WhatsApp customer association and customer detail modal.
- [x] Email customer association.
- [x] AI context and suggestions are cached in database and browser cache.
- [x] AI suggestion actions include draft reply, delete spam, tag spam, mark important, follow-up, assign sales, forward, and manual-analysis modes.
- [x] Per-number auto translation for received WhatsApp messages.
- [x] Per-number outbound translate-before-sending.
- [~] WhatsApp Actor Hub sync and webhook/SSE refresh support.
- [x] Add first-pass inbox server-side pagination and search for large mailboxes.
- [ ] Add failed sync/retry dashboard for Email and WhatsApp.

## 5. WhatsApp Actor Hub / WhatsApp 多开中枢

- [x] Actor Hub settings support connection test.
- [x] Actor/client pool configuration is user-specific.
- [x] Configurable actors/clients with selected client IDs.
- [x] Inbox sync uses configured user actor/client pool.
- [x] WhatsApp send prefers mapped mobile number over volatile chatId.
- [x] Webhook endpoint added for incoming WhatsApp events.
- [x] SSE event stream added for no-refresh inbox updates.
- [~] Background WhatsApp/Email sync support exists and should be monitored in production.
- [ ] Add UI for webhook registration status and last received webhook event.
- [x] Add first-pass operations health view for WhatsApp sync status and recent errors.
- [ ] Add per-actor detailed sync history and webhook registration status.

## 6. AI Agents / 智能体中心

- [x] Agent list and configuration use left/right layout instead of long modal.
- [x] Agents can be created, edited, and deleted.
- [x] Agent roles/instructions are configurable.
- [x] Agents select reusable model profiles.
- [x] Model profiles are separate from agent prompts.
- [x] Agents can configure available tools.
- [x] Agents can configure supported Lead Generation Platform integrations.
- [x] Agent schedules support interval and monthly-day modes with execution count.
- [x] Agent runs and trace logs support delete and clear.
- [x] Guardrails and approvals are database-backed.
- [x] Duplicate-operation guards prevent repeated processing for the same lead/customer where inappropriate.
- [x] Workflow tools include AI Lead Analysis and Lead Generation Platforms.
- [x] Scheduled agent execution works while browser/app runtime is active.
- [x] First-pass always-on server-side agent scheduler/worker added for database-backed agents.
- [x] Server-side scheduler can run configured Lead Generation Platform integrations, import returned leads, and avoid duplicate Public Pool inserts.
- [x] Add first-pass agent execution retry policy and failure classification.
- [ ] Add workflow run detail page with inputs, outputs, and linked records.

## 7. AI & Model Providers / AI 与模型

- [x] Model Profiles support Google Gemini, OpenAI, Anthropic, OpenRouter.ai, and custom OpenAI-compatible endpoints.
- [x] OpenRouter model field is free text.
- [x] Agents use selected model profiles instead of hard-coded Gemini.
- [x] Inbox AI analysis is cached and avoids repeated token usage unless manually re-run.
- [x] Translation cache checks browser cache, then database cache, then AI.
- [ ] Add provider health checks.
- [ ] Add per-profile usage/error counters.
- [ ] Add configurable default model profile by feature.

## 8. Lead Generation Platforms / 获客平台

- [x] Platform API configuration uses user-friendly UI, not browser/system prompts.
- [x] Configuration stores API key/base URL/auth header/method/path/provider identifiers.
- [x] Removed static search-query config from platform credentials.
- [x] Agents generate concrete search requests from CRM/RAG/product context.
- [x] Lead Generation Platforms workflow imports returned leads into Public Pool.
- [ ] Harden provider-specific integrations with real response mappers and error handling.
- [ ] Add platform test-run result preview.
- [ ] Add per-platform rate-limit and retry settings.

## 9. Dashboard / 仪表盘

- [x] Dashboard metrics.
- [x] GitHub-style contribution chart for user-related event counts.
- [ ] Add filters for contribution chart by event type/user/date range.
- [ ] Add drill-down from chart day to event list.

## 10. Deployment & Operations / 部署与运维

- [x] GitHub Actions deploy workflow.
- [x] Deployment script sets `PG_VECTOR_URL` from `DATABASE_URL` when needed.
- [x] Deployment clears stale untracked files while keeping `.env`.
- [x] PM2 restart points to current `dist/server.cjs`.
- [x] Deploy fails fast if legacy browser prompt UI is found in built assets.
- [x] `/api/deploy-info` endpoint exists for backend version verification.
- [x] Add automated smoke tests after deployment for health, operations logs, inbox sync, and agent scheduler endpoints.
- [ ] Add database migration/version endpoint.
- [x] Add first-pass production health dashboard for Email, WhatsApp, agent runs, imports, and lead-platform collection jobs.
- [x] Add first-pass searchable production logs/event history dashboard.

## 11. Documentation / 文档

- [x] README includes English usage guide.
- [x] README includes deployment and verification notes.
- [x] Roadmap added as `ROADMAP.md`.
- [x] Chinese README content rewritten in clean UTF-8.
- [x] README documents Operations Health, Production Logs, server scheduler, and agent retry behavior.
- [ ] Add architecture diagram and data flow diagrams.

---

## Recommended Next Milestones / 建议下一阶段

1. Add persistent operation event storage for long-term audit history.
2. Add database indexes for high-volume CRM record queries.
3. Add provider health checks for configured AI model profiles.
