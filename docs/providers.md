# Provider setup

`aatest` uses the OpenAI JavaScript SDK's Chat Completions client. A provider is
compatible when it accepts OpenAI-style `POST /chat/completions` requests below
the configured base URL and returns an OpenAI-style response.

## Compatibility contract

You must provide:

```env
TEST_GEN_BASE_URL=https://provider.example/v1
TEST_GEN_API_KEY=provider_key_or_required_placeholder
TEST_GEN_MODEL=provider_specific_model_id
```

`aatest` does not currently support custom headers, provider adapters, custom
prompt templates, the Anthropic Messages API, or the OpenAI Responses API.
Anthropic models work only through an OpenAI-compatible proxy such as 9Router
or OpenRouter.

## 9Router

9Router runs locally and presents a single OpenAI-compatible endpoint over the
providers and accounts connected in its dashboard.

### Install and start

```bash
npm install --global 9router
9router
```

The official defaults are:

- Dashboard: `http://localhost:20128`
- OpenAI-compatible base URL: `http://localhost:20128/v1`

### Connect a provider and get credentials

1. Open `http://localhost:20128`.
2. Open **Providers**.
3. Connect a supported provider or free provider using 9Router's flow.
4. Copy the API key shown by the 9Router dashboard.
5. Select a routed model and copy its exact model ID.

9Router's README uses `kr/claude-sonnet-4.5` as an example. Model availability
can change; always prefer the exact value displayed by your running dashboard.

### Configure aatest

Run `npx aatest init`, or set:

```env
TEST_GEN_BASE_URL=http://localhost:20128/v1
TEST_GEN_API_KEY=your_9router_dashboard_key
TEST_GEN_MODEL=kr/claude-sonnet-4.5
TEST_GEN_SOURCE=./src/__tests__
TEST_GEN_MAX_RETRIES=10
```

Keep the `9router` process running. A connection error usually means the local
service stopped, the port changed, or a firewall is blocking localhost.

Source: [official 9Router README](https://github.com/decolua/9router#readme).

## Common OpenAI-compatible endpoints

| Provider | Base URL | API key |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | Create in the OpenAI platform |
| OpenRouter | `https://openrouter.ai/api/v1` | Create in OpenRouter settings |
| Groq | `https://api.groq.com/openai/v1` | Create in GroqCloud |
| Ollama | `http://localhost:11434/v1` | Any non-empty value; Ollama ignores it |
| LM Studio | `http://localhost:1234/v1` | Token if enabled, otherwise a non-empty placeholder |

Use the provider's model page or local dashboard to copy the current model ID.
Do not infer it from a marketing name.

Official references:

- [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat)
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [Groq OpenAI compatibility](https://console.groq.com/docs/openai)
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat)

## Local provider examples

Ollama:

```env
TEST_GEN_BASE_URL=http://localhost:11434/v1
TEST_GEN_API_KEY=ollama
TEST_GEN_MODEL=your_local_ollama_model
```

LM Studio:

```env
TEST_GEN_BASE_URL=http://localhost:1234/v1
TEST_GEN_API_KEY=lm-studio
TEST_GEN_MODEL=your_loaded_lm_studio_model
```

Start the local server and load the selected model before invoking `aatest`.

## Provider error mapping

| Status | aatest behavior |
|---:|---|
| 401 | Reports an invalid API key |
| 402 | Reports insufficient credits |
| 429 | Waits five seconds and retries the provider call once |
| 400/413 | Reports that the source context is too large |
| Network/DNS | Reports a connection or base-URL problem |

The one provider retry for HTTP 429 is separate from
`TEST_GEN_MAX_RETRIES`, which controls generated-test repair attempts.
