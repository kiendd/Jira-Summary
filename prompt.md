## Prompts

Prompt templates được chuẩn bị sẵn trong `prompt-templates/`:
- `user.txt`: prompt cho từng người, chứa placeholder `{{DATE}}`, `{{TIMEZONE}}`, `{{USER_NAME}}`, `{{PROJECT_KEY}}`, `{{STATS_LINE}}`, `{{ACTION_LINES}}`.
- Hiện tại không dùng prompt chung all-users (file đã gỡ bỏ).

Khi chạy, ứng dụng sẽ:
- Đọc template, thay placeholder bằng dữ liệu runtime (chỉ dùng title/issue key, không dùng description).
- Ghi prompt đã điền vào `output/prompt-*.txt` (per-user) để tiện kiểm tra/gửi lại.
