## Jira Summary

CLI tóm tắt hành động Jira theo người trong một ngày (mặc định hôm nay, múi giờ GMT+7) và gọi LMX tại `http://localhost:8002` để rút gọn bullet.

### Cấu hình
1. Cài dependency: `npm install`
2. Tạo file `.env` từ mẫu:
   ```bash
   cp .env.example .env
   ```
   Điền:
   - `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_AUTH_TYPE=basic|pat`
   - `JIRA_PROJECT_KEY` (mặc định cho CLI, có thể override bằng `--project`)
   - `LMX_BASE_URL` (mặc định `http://localhost:8002`), `LMX_PATH` (mặc định `/v1/chat/completions`), `LMX_MODEL` nếu service yêu cầu.
   - Lọc user: `USER_INCLUDE` (danh sách tên/id, cách nhau bằng dấu phẩy) để chỉ tổng hợp user mong muốn; `USER_EXCLUDE` để bỏ qua.
   - PDF tiếng Việt: font NotoSans đã tải sẵn vào `fonts/`. Nếu bị xóa hãy tải lại `.ttf` trước khi xuất PDF.

### Chạy
- Mặc định (hôm nay, project từ env): `npm start`
- Chỉ định ngày: `npm start -- --date 2024-05-15`
- Chỉ định project: `npm start -- --project DEV`
- Xuất JSON thô: `npm start -- --json`
- Bỏ qua XLM: `npm start -- --skip-xlm`
- Bắt buộc LMX (fail nếu LMX lỗi): đặt `LMX_REQUIRED=true` trong env hoặc flag `--require-xlm`

### Đầu ra
- Nhóm theo người, hiển thị bullet tóm tắt từ XLM và thống kê: số issue tạo, chuyển trạng thái, comment, worklog (kèm tổng thời gian).
- Nếu không có hoạt động: in thông báo rỗng.

### Ghi chú triển khai
- Thời gian tính theo `Asia/Ho_Chi_Minh`, JQL gửi với offset GMT+7 để đảm bảo lọc đúng ngày.
- Thu thập hành động: issue tạo, chuyển trạng thái (từ changelog), comment, worklog (lấy đủ trang nếu >50).
- Nếu XLM trả lỗi, CLI sẽ trả về prompt raw để người dùng vẫn xem được nội dung cần tóm tắt.
