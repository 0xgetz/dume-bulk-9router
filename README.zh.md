<p align="center">
  <img src="brand/logo.svg" alt="dume-bulk-9router" width="420"/>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.id.md">Bahasa Indonesia</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="README.ja.md">日本語</a> ·
  <a href="README.es.md">Español</a>
</p>

<p align="center">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white">
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-success">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="9router" src="https://img.shields.io/badge/integrates-9router-8b5cf6">
  <img alt="status" src="https://img.shields.io/badge/E2E-verified-22c55e">
</p>

# dume-bulk-9router

批量创建 [Dume.ai](https://app.dume.ai) 账户，自动抓取每个账户的 auth token 与
会话 cookie，并通过 [9Router](https://9router.com) 作为一个兼容 OpenAI 的池对外提供，
支持轮询与自动故障转移。**零 npm 依赖**（Node ≥ 18）。

> Dume 的注册由 Cloudflare Turnstile 保护，因此创建器会驱动真实 Chromium
> （默认本地启动）通过验证，其余操作直接调用 Dume REST API。

---

## 功能

- **批量注册** —— 通过 Dume 官方界面（`app.dume.ai/signup`），使用
  [mail.tm](https://mail.tm) 邮箱接收 6 位验证码。
- **自动抓取 token + cookie** —— 从 `localStorage` 读取 JWT，并通过 CDP 拉取完整 cookie。
- **兼容 OpenAI 的池适配器** —— `/v1/chat/completions`（流式与非流式）与
  `/v1/models`，多账户轮询 + 故障转移。
- **一行命令接入 9Router** —— 注册 provider node 与 provider，模型以
  `dume/Kimi-K3` 等前缀出现。
- **自带 Chromium，无锁定** —— 可自行启动 headless 实例，或用 `CDP_URL`
  附加到任意浏览器。
- **无需 npm install** —— 仅使用 Node 标准库。

## 可用模型（免费套餐）

Dume 宣称 81 个聊天模型，**免费账户只有 9 个可用**（均通过 9Router 端到端验证）：

| 9Router 模型                 | 上游模型 ID（Dume）                  | 提供商     | 备注             |
|------------------------------|--------------------------------------|------------|------------------|
| `dume/Kimi-K3`               | `dume/moonshotai/Kimi-K3`            | moonshotai | 最快（~3.4 秒）  |
| `dume/MiniMax-M3`            | `dume/MiniMaxAI/MiniMax-M3`          | MiniMaxAI  | ~8 秒            |
| `dume/Qwen3.5-9B`            | `dume/Qwen/Qwen3.5-9B`               | Qwen       | ~6 秒            |
| `dume/Ternary-Bonsai-27B`    | `dume/Prism-ML/Ternary-Bonsai-27B`   | Prism-ML   | Dume 默认模型    |
| `dume/gpt-5-nano`            | `openai/gpt-5-nano`                  | openai     | ~6 秒            |
| `dume/gpt-5-nano-flex`       | `openai/gpt-5-nano-flex`             | openai     | ~6 秒            |
| `dume/gpt-5.6-luna`          | `openai/gpt-5.6-luna`                | openai     | ~3 秒            |
| `dume/gpt-5.6-luna-fast`     | `openai/gpt-5.6-luna-fast`           | openai     | ~3 秒            |
| `dume/gpt-5.6-luna-pro`      | `openai/gpt-5.6-luna-pro`            | openai     | ~5.6 秒          |

### 免费套餐中被封锁的模型（72 个）

- **68 个 `openai/*` 模型** —— GPT‑5.x、GPT‑6.x、Astra / Luna / Sol / Terra、
  o3 / o3‑pro、GPT‑4o / 4.1 系列、Codex 及图像/向量变体 —— 返回
  `Forbidden: AI model not allowed for your plan`。
- **4 个重量级 `dume/*` 模型** —— `dume/deepseek-ai/DeepSeek-V4-Pro`、
  `dume/openai/gpt-oss-20b`、`dume/MiniMaxAI/MiniMax-M2.7`、
  `dume/Qwen/Qwen3.5-397B-A17B` —— 返回 `Unable to access non-serverless model`
  （需要专用的 Together AI 端点）。

可用集合也可在 [`working_models.json`](working_models.json) 中机器读取。

## 环境要求

- Node.js **18+**
- Chromium/Chrome 可执行文件（自动检测，或设置 `CHROME_PATH`）
- Dume 可接受的网络出口（数据中心 IP 通常被拒 —— 使用住宅网络、自建代理，
  或通过 `CDP_URL` 使用已登录的浏览器）

## 快速开始

```bash
git clone https://github.com/0xgetz/dume-bulk-9router
cd dume-bulk-9router
node src/cli.js create --count 3 --out accounts.json   # 创建账户
bash run-adapter.sh                                     # 适配器 :8790
ROUTER_PASSWORD=123456 node src/connect-9router.js      # 接入 9Router
```

## 配置

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `CHROME_PATH` | 自动 | Chromium/Chrome 可执行文件 |
| `CDP_URL` | — | 附加到已有浏览器 |
| `HEADLESS` | `1` | `0` 显示浏览器窗口 |
| `DUME_ROUTING` | `round-robin` | `round-robin` 或 `random` |
| `ROUTER_URL` | `http://127.0.0.1:20128` | 9Router 地址 |
| `ROUTER_PASSWORD` | `123456` | 9Router 管理员密码 |

## CLI

```
node src/cli.js create  --count N [--out accounts.json]
node src/cli.js connect
node src/cli.js models | chat <model> "<text>" | pool | serve
```

Dume API 见 [`docs/PROTOCOL.md`](docs/PROTOCOL.md)，项目结构见
[`STRUCTURE.md`](STRUCTURE.md)。

## 法律

仅供教育与互操作性研究。自动化创建账户可能违反服务条款，使用后果由使用者自负。
采用 [MIT](LICENSE) 许可。
