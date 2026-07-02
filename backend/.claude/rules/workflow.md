---
description: Quy tắc phát triển — code quality, git conventions, ngôn ngữ, TDD workflow
---

# Workflow — TVU Event Ticket

## Ngôn ngữ

- UI text: **Tiếng Việt**
- Code (variable, function, comment): **Tiếng Anh**
- Commit message: **Tiếng Anh**, conventional commits

## Commit convention

```
feat:     tính năng mới
fix:      sửa lỗi
docs:     tài liệu
style:    format, không đổi logic
refactor: tái cấu trúc
test:     thêm/sửa test
chore:    build, config, deps
```

## Quy tắc viết code

### Không

- Không import thư viện UI ngoài (MUI, Ant Design, Chakra) — dùng Tailwind CSS
- Không `inline style` — chỉ Tailwind class hoặc CSS variable
- Không hard-code color value trong JSX
- Không animation phức tạp — chỉ `transition` đơn giản
- Không comment giải thích "cái gì" — chỉ comment khi WHY không hiển nhiên
- Không thêm error handling cho scenario không thể xảy ra
- Không thêm feature, refactor, abstraction ngoài phạm vi task

### Nên

- Mỗi component chỉ làm một việc
- Validate chỉ tại system boundary (user input, external API)
- Xóa hẳn code thừa thay vì comment out

## Git workflow

- Branch từ `main`, đặt tên: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- Mỗi PR nhỏ — một tính năng hoặc một fix
- Không push trực tiếp lên `main`
- Dùng git worktree khi cần dev song song (xem skill `using-git-worktrees`)

## TDD (bắt buộc cho logic nghiệp vụ)

RED → GREEN → REFACTOR. Không bỏ qua bước RED.  
Xem skill `test-driven-development` để biết chi tiết.

## Trước khi báo xong

Chạy skill `verification-before-completion` — không tự tuyên bố hoàn thành mà chưa verify.
