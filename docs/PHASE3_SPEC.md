# Phase 3: LLM Integration & Prompt Construction — Detailed Spec

> **Mục tiêu**: Tạo generic LLM client (hỗ trợ mọi OpenAI-compatible endpoint)
> và Prompt Builder — biến `ExtractedContext` từ Phase 2 thành một prompt hoàn chỉnh, structured để LLM viết ra test chuẩn.

---

## Cấu trúc file sẽ tạo mới

```
src/
├── llm/
│   └── client.ts              # Generic OpenAI-compatible HTTP client
├── modules/
│   └── prompt-builder.ts      # Xây dựng messages[] gửi cho LLM
└── types/
    └── llm.ts                 # Shared types: ChatMessage, LLMConfig
```

---

## Step 3.1 — `src/types/llm.ts` (LLM-specific types)

```typescript
// Tái sử dụng type từ openai SDK, wrap thêm để tường minh
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Config được truyền vào để khởi tạo LLMClient
export interface LLMClientConfig {
  apiKey: string;
  baseUrl: string;   // VD: https://openrouter.ai/api/v1
  model: string;     // VD: anthropic/claude-sonnet-4-5
  verbose?: boolean; // Có log token usage không
}
```

> Tách riêng types này để `prompt-builder.ts` và `client.ts` cùng import
> mà không bị phụ thuộc vào nhau (tránh circular dependency).

---

## Step 3.2 — `src/llm/client.ts` (Generic LLM Client)

### Tại sao dùng `openai` SDK cho mọi provider?

OpenRouter, Ollama, LM Studio, Groq, Azure OpenAI... đều expose
OpenAI-compatible REST API. Chỉ cần đổi `baseURL` + `apiKey` là xong.
Không cần viết HTTP client tay, không cần adapter riêng cho từng hãng.

### Class Design

```typescript
export class LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly verbose: boolean;

  constructor(config: LLMClientConfig)
  // new OpenAI({ apiKey, baseURL })

  async complete(messages: ChatMessage[]): Promise<string>
  // → Gọi API → trả về content string của response
}
```

### Error Handling trong `complete()`

| HTTP Code | Tình huống | Cách xử lý |
|---|---|---|
| `401` | API key sai | Throw: `"Invalid API key. Check TEST_GEN_API_KEY in your .env"` |
| `429` | Rate limit | Warn user, wait 5 giây, tự retry **1 lần**. Nếu fail lại → throw |
| `402` | Hết quota/credit | Throw: `"Insufficient credits. Top up your account at {baseUrl}"` |
| `400/413` | Prompt quá dài | Throw: `"Context too large. Try a smaller file or --truncate flag"` |
| Network error | Mất kết nối | Throw: `"Network error. Check your connection and BASE_URL setting"` |

### Token Usage Logging (khi `verbose: true`)

```
 INFO  Tokens used: 1,240 prompt + 856 completion = 2,096 total
```

---

## Step 3.3 — `src/modules/prompt-builder.ts`

Module này export ra **2 function**:

### Function 1: `buildGeneratePrompt(context, options?)`

Xây dựng mảng `ChatMessage[]` để gửi cho LLM lần đầu tiên (generate test).

#### System Prompt (bất biến)

```
You are an expert Node.js backend testing engineer.

Follow these STRICT rules WITHOUT exception:
1. Framework: Use Jest ONLY. Use Supertest for HTTP endpoint testing.
2. Pattern: Apply Arrange-Act-Assert (AAA) in EVERY describe/it block.
3. Mocking: Mock ALL external dependencies at the top using jest.mock().
   - Never allow real database calls, real HTTP calls, or real filesystem access.
4. Coverage: For EACH exported function/endpoint, write:
   - 1 Happy Path test (expected 2xx response)
   - At least 2 Error Case tests (4xx or 5xx)
5. Output format: Return ONLY the raw code.
   - NO explanation text before or after the code.
   - Wrap the ENTIRE output in exactly ONE code block: ```javascript ... ```
   - Do NOT split into multiple code blocks.
```

#### User Prompt (dynamic — inject từ ExtractedContext)

```
Analyze the following source file and generate a complete Jest + Supertest test suite.

File: {context.filePath}
Language: {context.language} | Module system: {context.moduleSystem}

=== SOURCE CODE ===
{context.fileContent}
(truncated nếu > 8000 chars, xem Step 3.4)

=== DEPENDENCIES TO MOCK ===
{grouped by category, mỗi dòng một dependency}
[model]   ../models/User.js → User
[service] ../services/email.service.js → sendEmail, verifyEmail
[library] bcrypt
[library] express

=== FUNCTIONS TO TEST ===
{chỉ list exports có type = function | arrow | default}
- async getUser(req, res) [line 9]
- async createUser(req, res) [line 19]

=== EXPRESS ENDPOINTS ===
{nếu routes.length > 0}
- GET  /users/:id  → getUser
- POST /users      → createUser

Generate the complete test file now.
```

---

### Function 2: `buildFixPrompt(faultyCode, stderr, attempt, maxRetries)`

Xây dựng `ChatMessage` (user role) để gửi thêm vào conversation khi test fail
(dùng lại `systemMessages` từ lần generate ban đầu → LLM có đủ context).

```
Attempt {attempt}/{maxRetries}: The test file you generated has Jest errors.
Analyze the errors carefully and return a FULLY FIXED version.

=== FAULTY TEST CODE ===
{faultyCode}

=== JEST ERROR OUTPUT ===
{stderr, truncated đến 2000 chars nếu quá dài}
--- end of error output ---

Return ONLY the fixed code in exactly ONE ```javascript ... ``` block.
Do NOT explain the changes.
```

---

## Step 3.4 — Logic Truncate khi file quá lớn

Nếu `context.fileContent.length > 8000 chars`:

```
1. Không gửi toàn bộ fileContent
2. Thay thế bằng:
   - Function signatures + JSDoc (5 dòng đầu của mỗi hàm)
   - + comment "// ... body truncated ..."
3. Append warning vào cuối User Prompt:
   "[WARNING: Source code was truncated due to size. Focus on the signatures and exports listed above.]"
4. logger.warn() để báo user trước khi gọi API
```

---

## Step 3.5 — Verify với `--dry-run`

Ở bước này chưa có `--dry-run` thật (sẽ implement ở Phase 5 cùng với unit.ts).
Nên mình sẽ tạo script verify tương tự Phase 2:

Tạo `scripts/test-prompt.ts`:
```typescript
// Đọc fixture → extractContext → buildGeneratePrompt → in ra prompt

const ctx = await extractContext('./test-fixtures/user.controller.js');
const messages = buildGeneratePrompt(ctx);

console.log('=== SYSTEM PROMPT ===');
console.log(messages[0].content);
console.log('\n=== USER PROMPT ===');
console.log(messages[1].content);
```

**Chạy bằng**: `npx tsx scripts/test-prompt.ts`

**Expected output**: Prompt hoàn chỉnh đúng format, list đầy đủ dependencies và exports từ fixture.

---

## Cấu trúc file sau Phase 3

```
src/
├── commands/
│   └── init.ts
├── config/
│   └── env-writer.ts
├── llm/
│   └── client.ts              ← MỚI
├── modules/
│   ├── ast-extractor.ts
│   └── prompt-builder.ts      ← MỚI
├── types/
│   ├── context.ts
│   └── llm.ts                 ← MỚI
├── utils/
│   └── logger.ts
├── config.ts
└── index.ts

scripts/
├── test-extract.ts
└── test-prompt.ts             ← MỚI
```

---

## Câu hỏi trước khi implement

> [!NOTE]
> **Q1**: Bạn có muốn thêm option **`--template`** để cho phép user tự viết System Prompt của riêng họ không?
> VD: `test-gen unit src/controller.js --template=./my-prompt.txt`
> Nếu có thì prompt-builder cần đọc thêm từ file.
> **Đề xuất: chưa cần ở Phase 3, có thể bổ sung sau.**

> [!IMPORTANT]
> **Q2**: Với fixtures hiện tại, `fileContent` chỉ ~700 chars nên không bị truncate.
> Logic truncate (Step 3.4) sẽ được implement nhưng **chưa có cách test tự động** ở phase này.
> Đề xuất: để spec trong code dưới dạng comment rõ ràng, test thủ công khi có file lớn hơn.
