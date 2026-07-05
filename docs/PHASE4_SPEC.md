# Phase 4: File I/O & Backup

**Mục tiêu**: Đảm bảo an toàn tuyệt đối khi thao tác với file hệ thống, tính toán đường dẫn output file chính xác, không bao giờ overwrite test file cũ mà không backup, và bóc tách (extract) chính xác code test từ markdown response của LLM.

## Component chính: `src/modules/file-writer.ts`

File module I/O độc lập xử lý các tác vụ về tập tin.

### 1. Trích xuất Code Block (`extractCodeBlock`)
- Dùng Regex bóc tách test code từ kết quả LLM trả về.
- Xử lý theo thứ tự ưu tiên nghiêm ngặt để đảm bảo lấy đúng code block nếu LLM trả về nhiều block lộn xộn:
  1. Block có tag `javascript` hoặc `js`
  2. Block có tag `typescript` hoặc `ts`
  3. Block trống (bare markdown code fence ` ``` `)
- Nếu không có bất kỳ block nào hợp lệ, module ném ra lỗi tuỳ chỉnh `ParseError`. Lỗi này đính kèm `rawResponse` (chuỗi văn bản nguyên bản từ LLM) để Orchestrator lưu log.

### 2. Tính toán đường dẫn Output (`getOutputPath`)
- Nhận vào đường dẫn file code cần test (inputPath) và thư mục lưu test (sourceDir).
- Loại bỏ thư mục gốc `src/` (hoặc thư mục cấp 1 của input nếu không có `src/`).
- Giữ lại cấu trúc thư mục con và ghép vào `sourceDir`.
- Đổi đuôi file một cách linh hoạt: `.js` ➔ `.spec.js`, `.ts` ➔ `.spec.ts`.
- **Ví dụ**: `src/backend/controllers/user.js` với `sourceDir='./tests'` ➔ `tests/backend/controllers/user.spec.js`.

### 3. Backup file cũ (`backupIfExists`)
- Kiểm tra xem file test đích đã tồn tại trên ổ cứng chưa.
- Nếu có, tiến hành sao chép nguyên trạng thành file `.bak` với timestamp chuẩn ISO 8601, bảo vệ code của người dùng.
- Tên file có dạng: `{tên_gốc}.{timestamp}.bak.{ext}`.

### 4. Ghi Error Log (`writeErrorLog`)
- Hàm lưu lại lỗi (khi LLM sinh text không chứa code, hoặc khi tự sửa lỗi thất bại sau nhiều lần).
- Logs được lưu tập trung vào thư mục `[sourceDir]/.test-gen-errors/`.
- Tên log kèm timestamp: `{filename}.{timestamp}.error.log`.

### 5. Ghi file an toàn (`writeFileSafe`)
- Gộp các bước:
  1. Chạy backup (nếu có file cũ).
  2. Dùng `fs.mkdir` đệ quy (`recursive: true`) đảm bảo thư mục đích có tồn tại.
  3. Dùng `fs.writeFile` để ghi kết quả cuối cùng.
  4. Trả về đường dẫn file backup để CLI thông báo lại cho người dùng.

---

*Ghi chú: Phase 4 chịu trách nhiệm xây dựng nền tảng vững chắc và an toàn cho Phase 5 (Test Runner & Self-Healing Loop).*
