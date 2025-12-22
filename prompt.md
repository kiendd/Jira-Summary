## Prompts

Prompt templates được chuẩn bị sẵn trong `prompt-templates/`:
- `user.txt`: prompt cho từng người, chứa placeholder `{{DATE}}`, `{{TIMEZONE}}`, `{{USER_NAME}}`, `{{PROJECT_KEY}}`, `{{STATS_LINE}}`, `{{ACTION_LINES}}`.
- `all-users.txt`: prompt chung cho mọi người, chứa `{{DATE}}`, `{{TIMEZONE}}`, `{{PROJECT_KEY}}`, `{{USERS_BLOCK}}`.

Khi chạy, ứng dụng sẽ:
- Đọc template, thay placeholder bằng dữ liệu runtime (chỉ dùng title/issue key, không dùng description).
- Ghi prompt đã điền vào `output/prompt-*.txt` (per-user) và `output/prompt-all-users.txt` (tổng hợp) để tiện kiểm tra/gửi lại.
