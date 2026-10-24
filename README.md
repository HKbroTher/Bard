# 多语言商务邮件助手 · Mail Assistant

一个网页工具，用 LLM 起草和翻译 **中文 / English / 日本語** 商务邮件。

**技术栈：** TypeScript · React (Vite) · Node.js (Express) · SQLite (`node:sqlite`) · Anthropic Claude API

## 功能

- **起草邮件**：从要点生成完整邮件（主题 + 正文），要点可以用任何语言写。
  - 8 种场景的提示词模板：开发信、跟进、询价、报价回复、会议邀约、感谢信、致歉、自定义
  - 6 种语气：礼貌 / 亲切 / 自信 / 简洁 / 歉意 / 紧急
  - 3 档正式程度，每种语言各有规则（例如日语的丁寧語与尊敬語・謙譲語、中文的「此致 敬礼」、英文的 Dear / Hi）
  - 可粘贴之前的邮件，用于跟进或回复
- **翻译 / 本地化**：三种语言互译，可选「地道本地化」或「忠实直译」，也可以同时调整语气和正式程度。
- **术语表**：维护三语术语对照（产品名、技术术语、贸易术语）。
  - 生成和翻译前，自动找出原文中出现的术语，并写进提示词作为必须遵守的约束
  - 生成后检查输出是否用了规定译法，并标出不一致的术语
  - 英文术语可设为区分大小写（如 `iCore`）；拉丁字母术语按词边界匹配（`API` 不会匹配到 `rapid`）
  - 支持 CSV 导入 / 导出（示例：[`examples/glossary-sample.csv`](examples/glossary-sample.csv)）
- **流式输出**：结果实时显示，生成后可以编辑、复制、用邮件客户端打开，或一键转去翻译。
- **历史记录**：每次生成都存入 SQLite。

## 快速开始

需要 Node.js ≥ 22.13（使用内置的 `node:sqlite`）。

```bash
npm install
cp .env.example .env      # 填写 ANTHROPIC_API_KEY
npm run dev               # API: http://localhost:3001  Web: http://localhost:5173
```

没有配置 API Key 时会自动进入**模拟模式**：返回示例文本，方便在离线状态下体验界面和术语检查流程。

生产构建：

```bash
npm run build
npm start                 # 由 Express 同时提供 API 和前端页面，访问 http://localhost:3001
```

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API Key |
| `LLM_MODEL` | `claude-opus-5-5` | 使用的模型 |
| `LLM_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max`，越高越细致，但更慢、更贵 |
| `LLM_MOCK` | 自动 | `1` 强制使用模拟模式，`0` 强制调用真实 API |
| `PORT` | `3001` | 服务端口 |
| `DB_PATH` | `data/mail-assistant.db` | SQLite 数据库文件路径 |

## 项目结构

```
server/src/
  prompts.ts    场景、语气、正式程度模板与提示词构建
  glossary.ts   术语匹配、输出一致性检查、CSV 解析
  llm.ts        Claude 流式调用（含拒答回退）与模拟客户端
  db.ts         SQLite：术语表、历史记录
  app.ts        Express 路由（SSE 流式输出、zod 校验）
  shared.ts     前后端共用的类型
web/src/
  pages/        起草、翻译、术语表、历史
  components/   结果面板、分段选择器
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/meta` | 可选的场景、语气、语言、正式程度 |
| POST | `/api/draft` | 起草邮件（SSE 流） |
| POST | `/api/translate` | 翻译邮件（SSE 流） |
| GET/POST | `/api/glossary` | 查询（`?q=`）/ 新增术语 |
| PUT/DELETE | `/api/glossary/:id` | 修改 / 删除术语 |
| POST | `/api/glossary/import` | 导入 CSV（`text/csv`） |
| GET | `/api/glossary/export.csv` | 导出 CSV |
| GET | `/api/history` | 历史记录 |
| DELETE | `/api/history/:id` | 删除一条历史记录 |

SSE 事件格式：`{type:"delta",text}`（逐段文本）→ `{type:"done",subject,body,glossary,historyId}`（结束），出错时为 `{type:"error",message}`。

## 测试

```bash
npm test          # vitest：术语匹配、提示词构建、输出解析、API 集成测试
npm run typecheck
```
