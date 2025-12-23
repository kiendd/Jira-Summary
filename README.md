## Jira Summary

CLI tóm tắt hành động Jira theo người trong một ngày (mặc định hôm nay, GMT+7) và có thể gửi báo cáo PDF/text qua FChat.

### Cấu hình (YAML)
1. Cài dependency: `npm install`
2. Tạo file `config.yaml` từ mẫu:  
   ```bash
   cp config.example.yaml config.yaml
   ```
3. Chỉnh `config.yaml`:
   - `defaultProject` (tuỳ chọn): project được dùng khi không truyền `--project`; nếu không đặt và không có `DEFAULT_PROJECT`, CLI sẽ chạy tất cả project trong file.
   - `defaults`: cấu hình chung cho tất cả project (timezone, maxConcurrency, LMX, FChat mặc định, và có thể đặt Jira chung ở `defaults.jira`).
   - `projects.<ID>`: cấu hình riêng cho từng project, override được defaults:
     - `enabled`: đặt `false` để tắt project (sẽ bị bỏ qua kể cả khi chạy all; nếu chỉ định qua `--project` và project bị tắt sẽ cảnh báo và bỏ qua).
     - `jira`: chỉ cần `projectKey` nếu đã đặt Jira chung ở `defaults.jira`; nếu không, khai báo đầy đủ `baseUrl`, `email`, `apiToken`, `authType=basic|pat`.
     - `fchat`: `enabled`, `token`, `groupId`, `sendText`, `sendPdf`, `headerTemplate`, `timeoutMs`, `baseUrl`.
     - `users`: danh sách accountId/displayName cần tổng hợp; muốn bỏ ai thì comment dòng đó.
4. (Tuỳ chọn) `.env` chỉ còn 2 biến:
   - `PROJECTS_CONFIG` (đường dẫn tới file YAML nếu không dùng tên mặc định `config.yaml`)
   - `DEFAULT_PROJECT` (override `defaultProject` trong YAML)

### Chạy
- Mặc định: nếu không có `--project` và không đặt `defaultProject`/`DEFAULT_PROJECT`, CLI sẽ chạy tất cả project trong file YAML.
- Chỉ định ngày: `npm start -- --date 2024-05-15`
- Chỉ định project: `npm start -- --project DEV` (hoặc nhiều project: `--project OPS,DEV`, hoặc toàn bộ: `--project all`)
- Xuất JSON thô: `npm start -- --json`
- Bỏ qua LMX: `npm start -- --skip-xlm`
- Bắt buộc LMX (fail nếu LMX lỗi): flag `--require-xlm` hoặc đặt `lmx.required: true` cho project.

### Đầu ra
- Nhóm theo người, hiển thị bullet tóm tắt (LMX hoặc local fallback) và thống kê: số issue tạo, chuyển trạng thái, comment, worklog (kèm tổng thời gian).
- Xuất PDF trong thư mục `output/summary-<PROJECT>-<DATE>.pdf`; nếu FChat bật, sẽ gửi text và/hoặc PDF tới group được cấu hình.
- Ghi log danh sách actor vào `output/actors-<PROJECT>.txt` để tiện mapping user.

### Ghi chú
- Thời gian tính theo `timezone` của project, JQL gửi với offset GMT+7 mặc định.
- Thu thập hành động: issue tạo, chuyển trạng thái, comment, worklog (lấy đủ trang nếu >50).
- Nếu LMX trả lỗi hoặc unavailable, sẽ fallback sang `buildLocalSummary` trừ khi `lmx.required` bật.
