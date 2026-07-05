# Phase 5: Test Runner & Self-Healing Loop

**Mục tiêu**: Kết nối tất cả các thành phần lại với nhau để chạy thử nghiệm (Jest), phát hiện lỗi và tự động gửi lỗi đó cho LLM (Self-Healing) để LLM sửa lại test code. Cuối cùng, ghép toàn bộ logic này vào lệnh CLI `test-gen unit`.

## 1. Test Runner (`src/modules/test-runner.ts`)
Module này chịu trách nhiệm chạy Jest một cách độc lập thông qua `child_process.spawn`.
- **Thực thi**: Gọi lệnh `npx jest <file> --no-coverage --colors=false --forceExit`.
- **Kiểm tra môi trường**: Tự động phát hiện nếu `jest` có sẵn trong `node_modules/.bin/jest` hay không (nếu không có thì dùng `npx jest` và cảnh báo người dùng).
- **Timeout**: Thiết lập giới hạn thời gian (VD: 60s). Nếu test chạy quá thời gian (ví dụ bị kẹt kết nối DB thật), sẽ tự động ngắt (kill process) và trả về lỗi `TIMEOUT`.
- **Đầu ra (Output)**: Trả về một object chứa `passed` (boolean), `stdout`, `stderr`, và `exitCode`.

## 2. Vòng lặp Self-Healing (`src/modules/heal.ts`)
Đây là trái tim của việc tự động sửa lỗi code do AI viết sai. Vòng lặp (loop) hoạt động như sau:
1. Nhận vào file test cần chạy.
2. Gọi `test-runner.ts` để chạy Jest.
3. Nếu **Pass** ✅: Kết thúc thành công.
4. Nếu **Fail** ❌:
   - Nếu cờ `--auto-heal` được bật: tự động chạy bước sửa lỗi.
   - Nếu không có `--auto-heal`: Dùng `@inquirer/prompts` để hỏi người dùng: *"Tests failed. Do you want to auto-fix? (Tip: use --auto-heal to skip this prompt)"*. Nếu user chọn "No", dừng chương trình.
5. **Tiến trình Heal (tối đa `maxRetries` lần)**:
   - Đọc code lỗi hiện tại.
   - Gọi `buildFixPrompt` (từ Phase 3) với thông tin lỗi (`stderr`).
   - Gọi `LLMClient` để lấy code mới.
   - Dùng `extractCodeBlock` (từ Phase 4) để bóc tách code. Nếu LLM trả text linh tinh (ParseError), ghi `error.log` và tính là 1 lần retry thất bại.
   - **Ghi đè file** (không dùng cơ chế backup ở bước này để tránh rác ổ cứng).
   - Chạy lại Jest. Lặp lại quá trình nếu vẫn Fail.
   - Nếu vượt quá số lần retries: Ghi file `[file_name].[timestamp].error.log` vào `.test-gen-errors/` (kèm `stderr` cuối cùng + `faulty code`) và exit chương trình.

## 3. Orchestrator (`src/commands/unit.ts`)
Đây là bộ điều khiển chính cho lệnh `test-gen unit <file>`. Nó ghép nối tất cả các Phase lại với nhau theo thứ tự:
1. `config.ts`: Load & validate config.
2. `ast-extractor.ts`: Trích xuất context từ file gốc (Phase 2). Nếu `exports: []` (không có hàm nào) thì hiện warning hỏi user có muốn tiếp tục không.
3. `prompt-builder.ts`: Tạo System/User prompt (Phase 3).
4. `llm/client.ts`: Gửi request cho LLM, dùng spinner `ora` để hiển thị trạng thái "Generating tests..." (Phase 3).
5. `file-writer.ts`: Bóc tách (extract) code, tính đường dẫn (output path), tạo backup và ghi file (Phase 4).
6. `heal.ts`: Khởi chạy Self-Healing loop để đảm bảo test Pass (Phase 5).
7. Thông báo thành công và in đường dẫn file test ra màn hình.

*Lưu ý*: Với cờ `--dry-run`, Orchestrator sẽ in prompt và LLM response ra màn hình ở bước 4 và dừng lại (bỏ qua bước 5 và 6).

## 4. CLI Entry Point (`src/index.ts`)
- Sửa lại `unitCommand` đang là stub hiện tại thành việc import `unitCommand` thực sự từ `src/commands/unit.ts`.
- Gắn lệnh này vào `program` của Commander.
