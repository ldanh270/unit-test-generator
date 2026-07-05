# Phase 2: AST Context Extraction — Detailed Spec

> **Mục tiêu**: Đọc một file JS/TS, dùng `@babel/parser` + `@babel/traverse` để trích xuất
> đầy đủ thông tin (exports, imports, routes) thành một object `ExtractedContext` có cấu trúc rõ ràng.
> Object này sẽ được dùng ở Phase 3 để xây dựng prompt cho LLM.

---

## Cấu trúc file sẽ tạo mới

```
src/
├── modules/
│   └── ast-extractor.ts       # Module chính của Phase 2
└── types/
    └── context.ts             # Interface definitions (ExtractedContext, v.v.)
```

> Tách `types/context.ts` riêng vì các phase sau (prompt builder, file writer) đều cần dùng các
> interface này — tránh circular dependency.

---

## Step 2.1 — Tạo `src/types/context.ts` (Interface definitions)

```typescript
// Kết quả AST extraction tổng hợp, là "ngôn ngữ chung" giữa các module
interface ExtractedContext {
  filePath: string;        // Absolute path của file được phân tích
  fileContent: string;     // Nội dung raw của file (gửi cho LLM)
  language: 'js' | 'ts';  // Detect từ extension: .ts/.tsx → 'ts', còn lại → 'js'
  moduleSystem: 'esm' | 'cjs';  // Detect từ cú pháp import/require
  exports: ExportedItem[];
  imports: ImportedDep[];
  routes: RouteEndpoint[];
}

// Một hàm/class/biến được export ra ngoài
interface ExportedItem {
  name: string;
  type: 'function' | 'class' | 'arrow' | 'variable' | 'default';
  isAsync: boolean;
  params: string[];   // Tên tham số (để ghi vào prompt)
  line: number;       // Số dòng trong file (context cho LLM)
}

// Một dependency được import vào file
interface ImportedDep {
  source: string;           // Tên module: 'mongoose', '../services/user.service'
  specifiers: string[];     // Tên các symbol import: ['User', 'Schema']
  isRelative: boolean;      // true nếu là file local (bắt đầu bằng ./ hoặc ../)
  category: DepCategory;
}

type DepCategory =
  | 'model'     // mongoose/sequelize/prisma hoặc path chứa 'model'/'schema'/'entity'
  | 'service'   // path chứa 'service'/'repo'/'repository'
  | 'config'    // path chứa 'config'/'env'/'setting'
  | 'util'      // relative path còn lại không thuộc các case trên
  | 'library';  // node_modules (absolute import, không phải relative)

// Một Express route được phát hiện trong file
interface RouteEndpoint {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;      // VD: '/users/:id'
  handler: string;   // Tên function handler, VD: 'getUser'
}
```

---

## Step 2.2 — Tạo `src/modules/ast-extractor.ts` (Module chính)

Module này sẽ export ra **1 function duy nhất** là `extractContext()`.  
Nội bộ nó sẽ chia thành nhiều **private helper functions**, mỗi cái chỉ làm 1 việc.

### Public API

```typescript
/**
 * Reads a source file and extracts structured context via AST analysis.
 * @param filePath Absolute or relative path to the source file.
 * @returns Populated ExtractedContext object.
 */
async function extractContext(filePath: string): Promise<ExtractedContext>
```

### Các private helpers bên trong

#### `detectLanguage(filePath: string): 'js' | 'ts'`
```
Logic: path.extname(filePath) → '.ts' | '.tsx' → 'ts', còn lại → 'js'
```

#### `detectModuleSystem(code: string): 'esm' | 'cjs'`
```
Logic:
  - Nếu code chứa 'import ' (regex: /^\s*import\s/m) → 'esm'
  - Nếu code chứa 'require(' → 'cjs'
  - Fallback: 'esm' (mặc định hiện đại)
```

#### `parseAST(code: string, language: 'js' | 'ts'): File`
```
Logic: Gọi @babel/parser.parse() với plugins phù hợp:
  - Nếu ts: ['typescript', 'decorators-legacy']
  - Nếu js: ['jsx', 'optionalChaining', 'nullishCoalescingOperator']
  - Luôn bật: sourceType: 'module' để handle cả ESM lẫn CJS
  - Bật strictMode: false và allowUmdGlobalAccess: true
    → để parse require() bên trong ESM module không bị lỗi
```

#### `extractImports(ast: File): ImportedDep[]`
```
Traverse tìm node: ImportDeclaration
  → source.value = tên module
  → specifiers: phân biệt 3 loại:
      - ImportDefaultSpecifier  → lấy local.name   (VD: import User from '...')
      - ImportNamespaceSpecifier → lấy local.name  (VD: import * as db from '...')
      - ImportSpecifier          → lấy local.name  (VD: import { sendEmail } from '...')
  → detectCategory() để phân loại

Traverse tìm node: CallExpression (cho CommonJS require)
  → callee là Identifier với name === 'require'
  → arguments[0] là StringLiteral → lấy .value làm source
  → specifiers: lấy từ VariableDeclarator parent nếu có (VD: const { X } = require('...'))
```

#### `detectCategory(source: string, isRelative: boolean): DepCategory`
```
Rules theo thứ tự ưu tiên:
  1. Nếu không isRelative (node_modules):
     - source là 'mongoose'|'sequelize'|'prisma'|'typeorm' → 'model'
     - còn lại → 'library'
  2. Nếu isRelative (file local):
     - source.match(/model|schema|entity/i) → 'model'
     - source.match(/service|repo|repository/i) → 'service'
     - source.match(/config|env|setting/i) → 'config'
     - còn lại → 'util'
```

#### `extractExports(ast: File): ExportedItem[]`
```
Traverse các node sau:

1. ExportNamedDeclaration
   - FunctionDeclaration bên trong → type: 'function'
   - VariableDeclaration → kiểm tra init của từng declarator:
     - ArrowFunctionExpression → type: 'arrow'
     - FunctionExpression → type: 'function'
     - còn lại → type: 'variable'
   - ClassDeclaration → type: 'class'

2. ExportDefaultDeclaration — phân biệt 3 case của declaration:
   - FunctionDeclaration → type: 'default', lấy .id.name (hoặc 'default' nếu anonymous)
   - ArrowFunctionExpression → type: 'default', name: 'default'
   - Identifier → type: 'default', name = identifier.name
     (VD: `export default router` — router đã được khai báo trước đó)

Với mỗi item extract ra:
   - isAsync: check property .async === true (false nếu không có)
   - params: map từng param:
     - Identifier → lấy .name
     - AssignmentPattern (default param) → lấy .left.name
     - RestElement → lấy '...' + .argument.name
   - line: node.loc.start.line
```

#### `extractRoutes(ast: File): RouteEndpoint[]`
```
Traverse CallExpression:
  - callee phải là MemberExpression
  - callee.property phải là Identifier với name là một trong:
    'get'|'post'|'put'|'delete'|'patch'
  - KHÔNG ép buộc callee.object phải là 'router' hay 'app'
    (để support chaining và đặt tên biến tuỳ ý)
  - arguments[0] phải là StringLiteral → đó là route path
  - Lấy handler name: duyệt arguments từ cuối lên đầu,
    tìm phần tử đầu tiên là Identifier → đó là handler
    (bỏ qua middleware là FunctionExpression/ArrowFunctionExpression ở giữa)
  - Nếu không tìm được Identifier handler → bỏ qua route này (không crash)
```

---

## Step 2.3 — Error Handling

| Tình huống | Cách xử lý |
|---|---|
| File không tồn tại | `fs.readFile` throw `ENOENT` → bắt lại, throw `Error('File not found: ...')` |
| File không parse được (syntax error) | `@babel/parser` throw → bắt lại, throw `Error('Cannot parse file: ... - Is this valid JS/TS?')` |
| File không có exports nào | Trả về `exports: []`, không throw. Caller (Phase 5) sẽ check và warn user |
| File có cú pháp decorator hoặc JSX | `@babel/parser` đã config sẵn, tự xử lý |

---

## Step 2.4 — Fixture test thủ công

Tạo file `test-fixtures/user.controller.js` để test module:

```javascript
// test-fixtures/user.controller.js
import User from '../models/User.js';
import { sendEmail } from '../services/email.service.js';
import bcrypt from 'bcrypt';
import express from 'express';

const router = express.Router();

export async function getUser(req, res) {
  // ...
}

export async function createUser(req, res) {
  // ...
}

router.get('/users/:id', getUser);
router.post('/users', createUser);

export default router;
```

Chạy test thủ công bằng script tạm (tạo file `scripts/test-extract.ts`):

```typescript
// scripts/test-extract.ts
import { extractContext } from '../src/modules/ast-extractor.js';
const ctx = await extractContext('./test-fixtures/user.controller.js');
console.log(JSON.stringify(ctx, null, 2));
```

```bash
# Chạy bằng:
npx tsx scripts/test-extract.ts
```

> **Lưu ý**: `tsx` không hỗ trợ flag `-e` (chỉ `node` mới có). Phải tạo file script riêng.

### Expected output phải có:
- `language: 'js'`
- `moduleSystem: 'esm'`
- `exports`: 3 items (`getUser`, `createUser`, default router)
- `imports`: 4 items với category đúng (`model`, `service`, `library`, `library`)
- `routes`: 2 items (`GET /users/:id`, `POST /users`)

---

## Cấu trúc file sau Phase 2

```
src/
├── commands/
│   └── init.ts
├── config/
│   └── env-writer.ts
├── modules/
│   └── ast-extractor.ts      ← MỚI
├── types/
│   └── context.ts            ← MỚI
├── utils/
│   └── logger.ts
├── config.ts
└── index.ts

test-fixtures/
└── user.controller.js        ← MỚI (fixture để test thủ công)
```

---

## Câu hỏi trước khi implement

> [!IMPORTANT]
> **Q1**: Bạn có muốn `extractContext()` cũng detect thêm các **middleware patterns** không?  
> VD: `router.use('/users', authMiddleware, userRouter)` — detect `authMiddleware` như một dependency cần mock.  
> Nếu có, sẽ phức tạp hơn một chút. **Đề xuất: bỏ qua, chỉ detect route handlers** cho đơn giản.

> [!NOTE]
> **Q2**: File `.ts` TypeScript có **decorators** (như NestJS: `@Controller`, `@Get`) có nằm trong scope không?  
> VD: `@Get('/users') async getUser()` — detect route qua decorator.  
> **Đề xuất: chưa cần, chỉ support Express.js router pattern** như đã plan.
