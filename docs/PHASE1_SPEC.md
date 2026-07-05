# Phase 1: Project Setup & CLI Bootstrapping — Detailed Spec

> **Mục tiêu**: Thiết lập bộ khung ứng dụng CLI bằng TypeScript, cấu hình build process (với tsup) và triển khai luồng lệnh khởi tạo (`test-gen init`).

---

## Cấu trúc file đã tạo

```
src/
├── commands/
│   └── init.ts             # Orchestrator cho luồng `test-gen init`
├── config/
│   └── env-writer.ts       # Service ghi cấu hình vào file .env
├── utils/
│   └── logger.ts           # Tiện ích in log ra màn hình console
├── config.ts               # Module parse và validate cấu hình lúc runtime
└── index.ts                # Entry-point của CLI
```

---

## 1. Setup Build & Scripts (`package.json`, `tsconfig.json`, `tsup.config.ts`)

- **Thư viện chính**:
  - `commander`: Xây dựng interface dòng lệnh (CLI).
  - `@inquirer/prompts`: Tạo luồng câu hỏi tương tác.
  - `dotenv`: Đọc biến môi trường.
  - `chalk`: In màu chữ trên Terminal.
- **Build tool**:
  - `tsup`: Biên dịch TypeScript sang JavaScript dạng ESM siêu nhanh, không cần config phức tạp.
  - Target build: `node18`, format: `esm`.
  - Có banner: `#!/usr/bin/env node` để hệ điều hành biết đây là CLI app.

---

## 2. Tiện ích Log (`src/utils/logger.ts`)

- Áp dụng nguyên tắc Single Responsibility (SRP).
- Cung cấp các hàm format log thống nhất toàn dự án:
  - `logger.success(msg)`
  - `logger.error(msg)`
  - `logger.info(msg)`
  - `logger.warn(msg)`
  - Dùng highlight blocks (vd: ` SUCCESS `) để hiển thị chuyên nghiệp.

---

## 3. Quản lý File Môi Trường (`src/config/env-writer.ts`)

- Class `EnvWriter` quản lý nghiệp vụ kiểm tra và ghi đè nội dung biến môi trường.
- Mặc định lưu vào file `.env` tại thư mục hiện hành (`process.cwd()`).
- Có chức năng nối thêm vào (append) nếu file `.env` đã có sẵn, hoặc tạo file mới hoàn toàn nếu chưa có.

---

## 4. Quản lý Cấu hình (`src/config.ts`)

- Module load biến môi trường thông qua `dotenv`.
- Export hàm `loadConfig(cliSourceOverride?: string): TestGenConfig`.
- Hàm này kết hợp tham số dòng lệnh và biến môi trường, sau đó ném lỗi (Error) nếu thông số bắt buộc (như `TEST_GEN_API_KEY`) bị khuyết.

---

## 5. Lệnh Khởi Tạo (`src/commands/init.ts`)

- Định nghĩa lệnh `test-gen init`.
- Đặt câu hỏi lần lượt qua màn hình console (base URL, api key, model name, output directory mặc định).
- Nhận input từ user -> Tạo obj config -> Chuyền cho `EnvWriter` xử lý -> Dùng `logger` in kết quả.

---

## 6. Main Entry (`src/index.ts`)

- Khởi tạo CLI bằng `new Command()`.
- Định nghĩa thông tin app (`test-gen`), version (`0.1.0`), description.
- Đăng ký lệnh `initCommand`.
- Đăng ký stub/mock cho lệnh `unitCommand` (Sẽ được viết chính thức ở các Phase sau).
- Gọi `program.parse(process.argv)` để thực thi CLI.
