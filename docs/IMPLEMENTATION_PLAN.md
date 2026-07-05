# Unit Test Generator CLI (`test-gen`) — Implementation Plan

> **Mục tiêu**: CLI tool `test-gen` viết bằng TypeScript, compile ra JS, publish-ready lên npm.  
> Hỗ trợ **bất kỳ OpenAI-compatible API** (OpenRouter, proxy, Gemini, v.v.) — chỉ cần `BASE_URL + API_KEY + MODEL`.

---

## Kiến trúc tổng quan & Data Flow

```
[User chạy CLI]
    │
    ├─ test-gen init                         → Tạo .env template (interactive)
    │
    └─ test-gen unit <file> [--source=<dir>] [--auto-heal]
            │
            ▼
    [Config Loader]  (src/config.ts)
            │  1. Load .env từ CWD
            │  2. Resolve output path: --source flag > TEST_GEN_SOURCE env > error
            ▼
    [AST Extractor]  (src/modules/ast-extractor.ts)
            │  Parse file → exports, imports, route endpoints
            ▼
    [Prompt Builder]  (src/modules/prompt-builder.ts)
            │  Tạo system prompt + user prompt với full context
            ▼
    [LLM Client - Generic]  (src/llm/client.ts)
            │  Gọi bất kỳ OpenAI-compatible endpoint
            │  (OpenRouter / proxy / trực tiếp)
            ▼
    [File Writer]  (src/modules/file-writer.ts)
            │  Parse code block → Backup file cũ → Write .spec.js
            ▼
    [Test Runner]  (src/modules/test-runner.ts)
            │  Chạy Jest → PASS → Done ✅
            │  FAIL → Hỏi user muốn self-heal không?
            │           (hoặc auto nếu --auto-heal)
            ▼
    [Self-Healing Loop]  (src/modules/heal.ts)
            │  Gửi (code + stderr) lên LLM → Fix → Retry (tối đa 3 lần)
            ▼
    [Output]
            <source>/controllers/user.controller.spec.js  ✅
```

---

## Tech Stack

| Mục đích | Thư viện | Ghi chú |
|---|---|---|
| CLI framework | `commander` | Subcommands: `init`, `unit` |
| Interactive prompts (init) | `@inquirer/prompts` | Hỏi user khi chạy `init` |
| LLM Client | `openai` SDK | Generic — đổi `baseURL` để dùng OpenRouter/proxy |
| AST Parser | `@babel/parser` + `@babel/traverse` | ESM + CJS, JS + TS |
| .env loader | `dotenv` | Load từ CWD của target project |
| Spinner + màu sắc | `ora` + `chalk` | UX đẹp |
| File I/O | `fs/promises` (built-in) | — |
| Process runner | `child_process` (built-in) | Chạy Jest |
| Build | `tsup` | Zero-config, output ESM |

---

## Cấu trúc thư mục

```
unit-test-generator/
├── src/
│   ├── index.ts                    # CLI entry — định nghĩa commands
│   ├── config.ts                   # Load & validate config từ .env
│   ├── commands/
│   │   ├── init.ts                 # `test-gen init` — setup wizard
│   │   └── unit.ts                 # `test-gen unit` — orchestrator chính
│   ├── modules/
│   │   ├── ast-extractor.ts        # AST parsing
│   │   ├── prompt-builder.ts       # Tạo prompts
│   │   ├── file-writer.ts          # Write + backup test file
│   │   ├── test-runner.ts          # Chạy Jest
│   │   └── heal.ts                 # Self-healing loop
│   └── llm/
│       └── client.ts               # Generic OpenAI-compatible client
├── dist/                           # Build output (gitignored)
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

---

## Cấu hình `.env` (trong target project)

```ini
# Required
TEST_GEN_API_KEY=sk-or-...          # API key (OpenRouter, OpenAI, bất kỳ)
TEST_GEN_BASE_URL=https://openrouter.ai/api/v1   # Base URL của API
TEST_GEN_MODEL=anthropic/claude-sonnet-4-5        # Tên model

# Optional
TEST_GEN_SOURCE=./src/tests         # Thư mục output cho test files
TEST_GEN_MAX_RETRIES=3              # Số lần retry self-heal (default: 3)
```

> **Lưu ý**: Nếu không có `TEST_GEN_BASE_URL`, default là `https://api.openai.com/v1`.

---

## Commands

### `test-gen init`
- Interactive wizard, tạo file `.env.test-gen` (hoặc append vào `.env` nếu user chọn)
- Hỏi: API key, base URL, model name, thư mục output mặc định
- In ra sample `.env` snippet để user review

### `test-gen unit <filePath> [options]`

| Option | Alias | Mô tả |
|---|---|---|
| `--source <dir>` | `-s` | Override thư mục output test (ưu tiên cao nhất) |
| `--auto-heal` | `-H` | Tự động self-heal khi test fail, không hỏi |
| `--retries <n>` | `-r` | Override số lần retry (default: `TEST_GEN_MAX_RETRIES` hoặc 3) |
| `--dry-run` | | In prompt + LLM response, không ghi file |
| `--verbose` | `-v` | Log chi tiết từng bước |

**Logic resolve output path**:
```
Priority: --source flag  >  TEST_GEN_SOURCE trong .env  >  Error (yêu cầu user chạy init hoặc thêm --source)
```

**Ví dụ**:
```bash
# Tìm output dir từ .env
test-gen unit src/controllers/user.controller.js

# Override output dir
test-gen unit src/controllers/user.controller.js --source=src/__tests__

# Auto self-heal không hỏi
test-gen unit src/controllers/user.controller.js --auto-heal

# Chỉ xem prompt, không ghi file
test-gen unit src/controllers/user.controller.js --dry-run
```

---

## Phase 1: Project Setup & CLI Bootstrapping

**Mục tiêu**: `test-gen --help` và `test-gen unit --help` chạy được.

### Tasks

#### 1.1 — Update `package.json`
```json
{
  "name": "test-gen",
  "version": "0.1.0",
  "description": "AI-powered unit test generator for Express.js",
  "bin": { "test-gen": "./dist/index.js" },
  "type": "module",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "prepublishOnly": "pnpm build"
  }
}
```

#### 1.2 — Cài dependencies
```bash
pnpm add commander @inquirer/prompts openai @babel/parser @babel/traverse @babel/types dotenv ora chalk

pnpm add -D typescript tsup tsx @types/node
```

#### 1.3 — `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

#### 1.4 — `tsup.config.ts`
```ts
import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  dts: false
})
```

#### 1.5 — `src/index.ts` — CLI entry
```ts
// Dùng commander để define:
// - test-gen init        → gọi initCommand()
// - test-gen unit <file> → gọi unitCommand()
// - Global options: --version, --help
```

#### 1.6 — `src/commands/init.ts` — Init wizard
```ts
// Dùng @inquirer/prompts để hỏi:
// 1. API Base URL? (default: https://api.openai.com/v1)
// 2. API Key?
// 3. Model name? (VD: gpt-4o, anthropic/claude-sonnet-4-5)
// 4. Default output directory? (VD: src/__tests__)
// 5. Max retries? (default: 3)
//
// Sau đó:
// - Hỏi: "Append to existing .env or create new .env.test-gen?"
// - Ghi config ra file tương ứng
// - In confirmation message + usage hint
```

#### 1.7 — `src/config.ts` — Config loader
```ts
interface TestGenConfig {
  apiKey: string;
  baseUrl: string;          // Default: https://api.openai.com/v1
  model: string;
  sourceDir: string;        // Resolved từ --source > .env > error
  maxRetries: number;       // Default: 3
}

// loadConfig(cliSource?: string): TestGenConfig
// - dotenv.config() từ CWD
// - Validate: apiKey, model phải có
// - Resolve sourceDir với priority logic
// - Throw lỗi rõ ràng nếu thiếu config
```

**Files tạo/sửa**: `package.json`, `tsconfig.json`, `tsup.config.ts`, `src/index.ts`, `src/commands/init.ts`, `src/config.ts`  
**Verify**: `pnpm build` → `node dist/index.js --help` → `node dist/index.js unit --help`

---

## Phase 2: AST Context Extraction

**Mục tiêu**: Extract đủ context từ file source để LLM viết test đúng.

### Tasks

#### 2.1 — `src/modules/ast-extractor.ts`

**Output `ExtractedContext`**:
```typescript
interface ExtractedContext {
  filePath: string;
  fileContent: string;
  language: 'js' | 'ts';
  moduleSystem: 'esm' | 'cjs';
  exports: ExportedItem[];
  imports: ImportedDep[];
  routes: RouteEndpoint[];       // Express routes nếu có
}

interface ExportedItem {
  name: string;
  type: 'function' | 'class' | 'arrow' | 'default';
  isAsync: boolean;
  params: string[];
  line: number;
}

interface ImportedDep {
  source: string;                // 'mongoose', '../models/User'
  specifiers: string[];
  isRelative: boolean;
  category: 'model' | 'service' | 'util' | 'library' | 'config';
}

interface RouteEndpoint {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: string;
}
```

#### 2.2 — Logic detect module system
- Có `import ... from` → `esm`
- Có `require(` → `cjs`
- Fallback: đọc `package.json` của CWD

#### 2.3 — Logic phân loại import category
```
mongoose/sequelize/prisma/typeorm    → 'model'
path chứa 'model'/'schema'/'entity' → 'model'
path chứa 'service'/'repo'          → 'service'
path chứa 'config'/'env'            → 'config'
relative path còn lại               → 'util'
node_modules còn lại                → 'library'
```

#### 2.4 — Logic detect Express routes
- Traverse `CallExpression`: `router.get(path, handler)`, `app.post(path, handler)`, v.v.
- Extract method, path literal, handler name

**Files tạo**: `src/modules/ast-extractor.ts`  
**Verify**: Script thủ công extract file controller mẫu, in JSON ra console

---

## Phase 3: LLM Integration & Prompt Construction

**Mục tiêu**: Generic LLM client hoạt động với OpenRouter/bất kỳ OpenAI-compatible endpoint.

### Tasks

#### 3.1 — `src/llm/client.ts` — Generic client

```typescript
import OpenAI from 'openai';

// Khởi tạo một lần với config:
// new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl })
//
// Expose:
// complete(messages: ChatMessage[]): Promise<string>
// - Gọi client.chat.completions.create(...)
// - Handle lỗi: rate limit (429) → wait 5s, retry 1 lần
//              auth error (401) → throw với message rõ ràng
//              other → throw
// - Log token usage nếu --verbose
```

> **Tại sao dùng `openai` SDK cho mọi provider?**  
> OpenRouter, LM Studio, Ollama, Azure OpenAI, v.v. đều expose OpenAI-compatible API.  
> Chỉ cần đổi `baseURL` + `apiKey` là xong — không cần code riêng cho từng provider.

#### 3.2 — `src/modules/prompt-builder.ts`

**`buildGeneratePrompt(context: ExtractedContext): ChatMessage[]`**:

```
SYSTEM:
You are an expert Node.js testing engineer. Follow these STRICT rules:
1. Use Jest + Supertest ONLY
2. Apply Arrange-Act-Assert (AAA) pattern in EVERY test block
3. Mock ALL imports using jest.mock() at the top of the file
4. Cover: Happy Path (200/201) AND at least 2 Error Cases (400/500)
5. Return ONLY the {language} code — no explanation, no markdown prose
6. Wrap the entire output in exactly ONE code block: ```javascript ... ```

USER:
File: {filePath}
Language: {language} | Module system: {moduleSystem}

=== SOURCE CODE ===
{fileContent}

=== DEPENDENCIES TO MOCK ===
{imports → grouped by category}
- [model] mongoose (User, Order)
- [service] ../services/email.service (sendEmail)
- [library] bcrypt

=== EXPORTS TO TEST ===
- getUser(req, res) [async]
- createUser(req, res) [async]

=== EXPRESS ENDPOINTS ===
- GET /users/:id → getUser
- POST /users    → createUser

Generate a complete Jest + Supertest test file.
```

**`buildFixPrompt(faultyCode, stderr): ChatMessage`**:
```
The test file below has Jest errors. Fix ALL issues.

=== FAULTY TEST CODE ===
{faultyCode}

=== JEST ERROR OUTPUT ===
{stderr (truncated to 2000 chars nếu quá dài)}

Return ONLY the fixed code in one ```javascript ... ``` block.
```

**Files tạo**: `src/llm/client.ts`, `src/modules/prompt-builder.ts`  
**Verify**: `--dry-run` mode in ra prompt hoàn chỉnh + mock LLM response

---

## Phase 4: File I/O & Backup

**Mục tiêu**: Ghi file an toàn, không bao giờ overwrite mà không backup.

### Tasks

#### 4.1 — `src/modules/file-writer.ts`

**Logic tính output path**:
```
sourceDir = resolved từ --source / .env / error

input:  src/controllers/user.controller.js
output: {sourceDir}/controllers/user.controller.spec.js

Rule:
1. Lấy relative path của input so với CWD
2. Strip phần đầu đến src/ (hoặc first segment nếu không có src/)
3. Nối vào sourceDir
4. Thay extension: .js → .spec.js | .ts → .spec.ts
```

**Ví dụ**:
```
--source=./backend/tests
src/controllers/user.controller.js
→ backend/tests/controllers/user.controller.spec.js
```

**Logic backup**:
```typescript
async function backupIfExists(outputPath: string): Promise<string | null>
// Nếu file tồn tại:
//   Copy sang: {base}.{timestamp}.bak.js
//   VD: user.controller.spec.2026-07-05T08-14-00.bak.js
//   Return: backup path
// Nếu không: return null
```

**Logic extract code block**:
```typescript
function extractCodeBlock(llmResponse: string): string
// 1. Tìm ```javascript ... ``` hoặc ```js ... ```
// 2. Thử ```typescript ... ``` nếu không thấy
// 3. Thử ``` ... ``` (bare code fence)
// 4. Nếu vẫn không tìm thấy → throw ParseError
//    (không ghi file, log raw response vào scratch)
```

**Files tạo**: `src/modules/file-writer.ts`  
**Verify**: Chạy thủ công với LLM response mẫu, kiểm tra file output + backup

---

## Phase 5: Test Runner & Self-Healing Loop

**Mục tiêu**: Chạy Jest, hỏi user trước khi self-heal (hoặc auto nếu `--auto-heal`).

### Tasks

#### 5.1 — `src/modules/test-runner.ts`

```typescript
interface RunResult {
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runJest(testFilePath: string, cwd: string): Promise<RunResult>
// Dùng child_process.spawn (stream, không block)
// Command: npx jest <testFilePath> --no-coverage --colors=false --forceExit
// Timeout: 60s — nếu quá timeout → kill process, passed = false, stderr = "TIMEOUT"
// Capture stdout + stderr vào string
```

#### 5.2 — `src/modules/heal.ts` — Self-healing loop

```typescript
async function selfHeal(options: {
  testFilePath: string;
  llmClient: LLMClient;
  systemMessages: ChatMessage[];
  maxRetries: number;
  autoHeal: boolean;
  cwd: string;
}): Promise<void>

// Flow:
// 1. Chạy Jest lần đầu
// 2. Nếu PASS → return
// 3. Nếu FAIL:
//    a. Nếu --auto-heal: tự động heal
//    b. Nếu không: hỏi user qua @inquirer/prompts:
//       "Tests failed. Do you want to auto-fix? (Tip: use --auto-heal to skip this prompt)"
//       → Yes → heal
//       → No  → exit 1 (in đường dẫn error log)
// 4. Vòng lặp heal (tối đa maxRetries lần):
//    a. Đọc code hiện tại
//    b. Build fix prompt với stderr
//    c. Gọi LLM → extract code → overwrite file (không backup lần 2)
//    d. Chạy Jest lại
//    e. Nếu PASS → break
//    f. Nếu hết retries → ghi error log → exit 1
```

#### 5.3 — Error log
```
Nếu self-heal thất bại sau N lần:
Ghi file: {sourceDir}/.test-gen-errors/{filename}.error.log
Nội dung: timestamp + final stderr + faulty code
In ra: đường dẫn file log để user debug
```

#### 5.4 — `src/commands/unit.ts` — Orchestrator

```typescript
// Combine tất cả phases:
// 1. loadConfig(cliOptions.source)
// 2. astExtract(filePath)
// 3. buildGeneratePrompt(context)
// 4. llmClient.complete(messages)     ← với spinner "Generating tests..."
// 5. extractCodeBlock(response)
// 6. backupIfExists(outputPath)
// 7. writeFile(outputPath, code)
// 8. selfHeal({ ... })
// 9. Log thành công + đường dẫn file
```

**Files tạo**: `src/modules/test-runner.ts`, `src/modules/heal.ts`, `src/commands/unit.ts`

---

## Edge Cases & Risk Mitigation

| # | Rủi ro | Giải pháp |
|---|---|---|
| 1 | **Self-heal vô hạn** | Hard limit `maxRetries` (default 3, configurable). Sau khi hết → ghi `.error.log`, exit code 1 |
| 2 | **LLM response không có code block** | `extractCodeBlock()` throw `ParseError`. Không ghi file. Retry prompt với hint: "You forgot the code fence markers" (tính vào retry count) |
| 3 | **File quá lớn, vượt context limit LLM** | Nếu `fileContent` > 8000 chars: truncate, chỉ giữ function signatures + JSDoc. Warn user. Nếu LLM trả lỗi 400/413 → emit error rõ ràng |
| 4 | **Database bị gọi thật trong test** | Prompt engineer rõ. Nếu test timeout (>60s) → coi là FAIL với stderr "TIMEOUT: possible real DB connection" |
| 5 | **File không có exports** | AST extractor trả `exports: []` → warn và hỏi user có muốn tiếp tục không (chế độ `--force` để skip) |
| 6 | **Jest chưa cài trong target project** | Check `node_modules/.bin/jest` trong CWD. Nếu không có: warn "Jest not found, running with npx jest (slower)". Vẫn dùng `npx jest` |
| 7 | **`--source` path không tồn tại** | `fs.mkdirSync(sourceDir, { recursive: true })` tự tạo thư mục |
| 8 | **API key sai / hết quota** | Catch 401/429/402 → throw với message actionable: "Check your API key" / "Rate limit hit, wait and retry" |

---

## Verification Plan

| Phase | Lệnh verify |
|---|---|
| Phase 1 | `pnpm build` → `node dist/index.js --help` → `node dist/index.js unit --help` |
| Phase 1 | `node dist/index.js init` → wizard chạy → file .env được tạo |
| Phase 2 | Script thủ công: `extractContext('fixtures/user.controller.js')` → in JSON |
| Phase 3 | `test-gen unit fixtures/user.controller.js --dry-run` → in prompt hoàn chỉnh |
| Phase 4 | Chạy với file đã có test → kiểm tra `.bak.js` được tạo |
| Phase 5 | Thử với file test sai cố ý → test interactive prompt heal |
| E2E | Tạo `test-fixtures/user.controller.js` → chạy `test-gen unit` → Jest pass ✅ |
