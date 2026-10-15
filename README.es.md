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

Crea cuentas de [Dume.ai](https://app.dume.ai) en lote, extrae automáticamente el
auth token y las cookies de sesión de cada cuenta, y las sirve a
[9Router](https://9router.com) como un único pool compatible con OpenAI, con
round-robin y failover automático. **Cero dependencias npm** (Node ≥ 18).

> El registro de Dume está protegido por Cloudflare Turnstile, así que el creador
> controla un Chromium real (lanzado localmente por defecto) para superar el reto y
> luego usa la API REST de Dume para todo lo demás.

---

## Características

- **Registro masivo** a través de la UI de Dume (`app.dume.ai/signup`) usando
  buzones de [mail.tm](https://mail.tm) para el código de 6 dígitos.
- **Extracción automática de token + cookies** — lee el JWT desde `localStorage`
  y recoge todas las cookies por CDP.
- **Adaptador de pool compatible con OpenAI** — `/v1/chat/completions` (stream y
  no-stream) y `/v1/models`, con round-robin y failover entre cuentas.
- **Conexión a 9Router en un comando** — registra el provider node y el provider;
  los modelos aparecen con un prefijo como `dume/Kimi-K3`.
- **Chromium propio, sin lock-in** — lanza su propia instancia headless o se
  conecta a cualquier navegador con `CDP_URL`.
- **Sin npm install** — solo la librería estándar de Node.

## Modelos disponibles (plan Free)

De los 81 modelos de chat que anuncia Dume, **9 responden en una cuenta Free**
(todos verificados de extremo a extremo a través de 9Router):

| Modelo vía 9Router           | ID del modelo (Dume)                 | Proveedor  | Notas             |
|------------------------------|--------------------------------------|------------|-------------------|
| `dume/Kimi-K3`               | `dume/moonshotai/Kimi-K3`            | moonshotai | el más rápido (~3.4 s) |
| `dume/MiniMax-M3`            | `dume/MiniMaxAI/MiniMax-M3`          | MiniMaxAI  | ~8 s              |
| `dume/Qwen3.5-9B`            | `dume/Qwen/Qwen3.5-9B`               | Qwen       | ~6 s              |
| `dume/Ternary-Bonsai-27B`    | `dume/Prism-ML/Ternary-Bonsai-27B`   | Prism-ML   | modelo por defecto de Dume |
| `dume/gpt-5-nano`            | `openai/gpt-5-nano`                  | openai     | ~6 s              |
| `dume/gpt-5-nano-flex`       | `openai/gpt-5-nano-flex`             | openai     | ~6 s              |
| `dume/gpt-5.6-luna`          | `openai/gpt-5.6-luna`                | openai     | ~3 s              |
| `dume/gpt-5.6-luna-fast`     | `openai/gpt-5.6-luna-fast`           | openai     | ~3 s              |
| `dume/gpt-5.6-luna-pro`      | `openai/gpt-5.6-luna-pro`            | openai     | ~5.6 s            |

### Bloqueados en el plan Free (72 modelos)

- **68 modelos `openai/*`** — familias GPT‑5.x, GPT‑6.x, Astra / Luna / Sol /
  Terra, o3 / o3‑pro, GPT‑4o / 4.1, Codex y variantes de imagen/embedding —
  devuelven `Forbidden: AI model not allowed for your plan`.
- **4 modelos pesados `dume/*`** — `dume/deepseek-ai/DeepSeek-V4-Pro`,
  `dume/openai/gpt-oss-20b`, `dume/MiniMaxAI/MiniMax-M2.7`,
  `dume/Qwen/Qwen3.5-397B-A17B` — devuelven
  `Unable to access non-serverless model` (requieren un endpoint dedicado de Together AI).

La lista disponible también está en [`working_models.json`](working_models.json).

## Requisitos

- Node.js **18+**
- Un binario de Chromium/Chrome (se detecta solo, o define `CHROME_PATH`).
- Una ruta de red que Dume acepte. Los controles anti-bot rechazan la mayoría de
  IPs de datacenter — usa una conexión residencial, tu propio proxy, o un navegador
  ya autenticado mediante `CDP_URL`.

## Inicio rápido

```bash
git clone https://github.com/0xgetz/dume-bulk-9router
cd dume-bulk-9router
node src/cli.js create --count 3 --out accounts.json   # crear cuentas
bash run-adapter.sh                                     # adaptador :8790
ROUTER_PASSWORD=123456 node src/connect-9router.js      # conectar a 9Router
```

## Configuración

| Variable | Por defecto | Uso |
|----------|-------------|-----|
| `CHROME_PATH` | auto | Binario de Chromium/Chrome |
| `CDP_URL` | — | Conectar a un navegador existente |
| `HEADLESS` | `1` | `0` muestra el navegador |
| `DUME_ROUTING` | `round-robin` | `round-robin` o `random` |
| `ROUTER_URL` | `http://127.0.0.1:20128` | URL de 9Router |
| `ROUTER_PASSWORD` | `123456` | Contraseña admin de 9Router |

## CLI

```
node src/cli.js create  --count N [--out accounts.json]
node src/cli.js connect
node src/cli.js models | chat <model> "<text>" | pool | serve
```

Consulta [`docs/PROTOCOL.md`](docs/PROTOCOL.md) para la API de Dume y
[`STRUCTURE.md`](STRUCTURE.md) para la estructura.

## Legal

Para investigación educativa e interoperabilidad. Automatizar la creación de cuentas
puede violar los Términos de Servicio. El uso es tu responsabilidad. Licencia
[MIT](LICENSE).
