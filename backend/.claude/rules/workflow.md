---
description: Quy tắc phát triển backend — commands, git conventions, ngôn ngữ, TDD workflow
---

# Workflow — TVU Event & Ticket backend

## Commands (chạy từ `backend/`)

```bash
docker compose -f infra/docker-compose.monolith.yml up -d   # Postgres, Redis, RabbitMQ, Mailpit + app
mvn clean install                                           # build toàn reactor
mvn -pl monolith -am spring-boot:run                        # chạy app (profile dev,monolith)
mvn -pl monolith test -Dtest=SomeTest                       # chạy 1 test class
```

## Ngôn ngữ

- UI text (do frontend giữ): **Tiếng Việt** — backend chỉ trả message/`code` cho frontend hiển thị.
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

- **Không** thêm `Co-Authored-By` hay bất kỳ attribution AI/Claude nào vào commit message — trong repo này, không bao giờ.
- Chỉ commit khi user yêu cầu.

## Quy tắc viết code

- Constructor injection, field `private final` — không field `@Autowired`.
- Controller mỏng (validate + delegate); business logic ở `@Service`.
- Validate chỉ tại system boundary (user input, external API).
- Không expose `@Entity` ra API — dùng DTO + MapStruct.
- Không comment giải thích "cái gì" — chỉ comment khi WHY không hiển nhiên.
- Không thêm error handling cho scenario không thể xảy ra.
- Không thêm feature/refactor/abstraction ngoài phạm vi task.
- Xóa hẳn code thừa thay vì comment out.

*(Chi tiết code style: `.claude/docs/coding-standards.md`. Bất biến kiến trúc: `.claude/rules/architecture.md`.)*

## Git workflow

- Branch từ `main`: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`. Không push trực tiếp lên `main`.
- Mỗi PR nhỏ — một tính năng hoặc một fix; commit theo từng task.
- Dùng worktree cô lập cho feature mới: skill `using-git-worktrees` (ưu tiên tool native `EnterWorktree`).
- Kết thúc branch: skill `finishing-a-development-branch`.

## TDD (bắt buộc cho logic nghiệp vụ)

RED → GREEN → REFACTOR. Không bỏ qua bước RED. Scaffold thuần (không logic) thì miễn — nói rõ lý do.
Xem skill `test-driven-development`.

## Trước khi báo xong

Chạy skill `verification-before-completion` — không tự tuyên bố hoàn thành mà chưa verify (chạy lệnh, xem output).
