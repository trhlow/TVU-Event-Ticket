# Sơ đồ UML & Phân tích Hệ thống
## TVU Event & Ticketing Platform

_Tài liệu này tổng hợp các sơ đồ trực quan bổ trợ cho SRS: Use Case, Activity, Class, Sequence, DFD, ER và sơ đồ triển khai (Component/Deployment). Toàn bộ sơ đồ dùng cú pháp [Mermaid](https://mermaid.js.org) — có thể chỉnh sửa trực tiếp trong file `.md` này._

---

## 1. Sơ đồ Use Case

_Tác nhân: Sinh viên, Ban tổ chức (Organizer), Quản trị viên (Super Admin). Quan hệ `include`/`extend` thể hiện bằng đường nét đứt._

```mermaid
flowchart LR
    SV(("Sinh viên"))
    BTC(("Ban tổ chức (Organizer)"))
    QT(("Quản trị viên (Super Admin)"))

    subgraph SYS["Hệ thống TVU Event and Ticketing"]
        UC1(["Đăng nhập bằng tài khoản Microsoft"])
        UC2(["Hoàn thiện hồ sơ (MSSV, lớp)"])
        UC3(["Xem danh sách và chi tiết sự kiện"])
        UC4(["Gửi đăng ký giữ chỗ"])
        UC5(["Xem trạng thái đăng ký của tôi"])
        UC6(["Tạo / sửa / xóa sự kiện"])
        UC7(["Duyệt đăng ký"])
        UC8(["Từ chối đăng ký"])
        UC9(["Phát hành vé điện tử kèm mã QR"])
        UC10(["Quét mã QR điểm danh"])
        UC11(["Xem dashboard của CLB"])
        UC12(["Xuất danh sách attendees (CSV)"])
        UC13(["Quản lý tài khoản Organizer"])
        UC14(["Quản lý danh mục CLB"])
        UC15(["Xem audit log và thống kê toàn trường"])
    end

    SV --- UC1
    SV --- UC2
    SV --- UC3
    SV --- UC4
    SV --- UC5
    BTC --- UC1
    BTC --- UC6
    BTC --- UC7
    BTC --- UC8
    BTC --- UC10
    BTC --- UC11
    BTC --- UC12
    QT --- UC1
    QT --- UC13
    QT --- UC14
    QT --- UC15

    UC4 -. "include" .-> UC1
    UC7 -. "include" .-> UC9
    UC2 -. "extend" .-> UC1

    style SYS fill:#F4F6F8,stroke:#66788A,stroke-width:1px
```

---

## 2. Sơ đồ Hoạt động (Activity Diagram)

_Luồng nghiệp vụ đầy đủ: gửi đăng ký → duyệt (giữ chỗ nguyên tử) → phát hành vé → điểm danh QR._

```mermaid
flowchart TD
    START(["Bắt đầu"]) --> A["Sinh viên chọn sự kiện đang OPEN"]
    A --> B{"Hồ sơ đã hoàn thiện?"}
    B -- "Không" --> B1["Yêu cầu hoàn thiện hồ sơ (MSSV, lớp)"] --> END1(["Kết thúc"])
    B -- "Có" --> C{"Đã đăng ký sự kiện này chưa?"}
    C -- "Rồi" --> C1["Từ chối: đã đăng ký"] --> END1
    C -- "Chưa" --> D["Tạo Reservation, trạng thái PENDING"]
    D --> E["Ban tổ chức xem danh sách chờ duyệt"]
    E --> F{"Ban tổ chức quyết định?"}
    F -- "Từ chối" --> G["Reservation = REJECTED"] --> END1
    F -- "Duyệt" --> H["Redis: DECR nguyên tử số vé còn lại"]
    H --> I{"Còn vé?"}
    I -- "Không" --> I1["Trả lỗi 409 Hết vé, Reservation vẫn PENDING"] --> END1
    I -- "Có" --> J["Transaction DB: Reservation=APPROVED, tạo Ticket=VALID, ghi Outbox"]
    J --> K["Relay publish message lên RabbitMQ"]
    K --> L["Gói notification sinh mã QR (HMAC), gửi email vé"]
    L --> M["Sinh viên nhận vé điện tử"]
    M --> N["Sinh viên đến sự kiện, Organizer quét mã QR"]
    N --> O{"Chữ ký hợp lệ và vé còn VALID?"}
    O -- "Không" --> O1["Từ chối điểm danh"] --> END1
    O -- "Có" --> P["Cập nhật Ticket = CHECKED_IN"] --> END2(["Kết thúc"])
```

---

## 3. Sơ đồ Lớp (Class Diagram)

_Mô hình hóa các thực thể dữ liệu chính và quan hệ giữa chúng (tương ứng Mục 6 của SRS)._

```mermaid
classDiagram
    class Club {
        +UUID club_id
        +String name
        +DateTime created_at
    }
    class User {
        +UUID user_id
        +String email
        +Role role
        +String mssv
        +UUID club_id
        +Boolean profile_complete
        +completeProfile(mssv, lop)
    }
    class Event {
        +UUID event_id
        +UUID club_id
        +String title
        +Integer capacity
        +EventStatus status
        +DateTime open_at
        +DateTime close_at
        +getAvailability()
    }
    class Reservation {
        +UUID reservation_id
        +UUID event_id
        +UUID student_id
        +ReservationStatus status
        +String idempotency_key
        +approve()
        +reject()
    }
    class Ticket {
        +UUID ticket_id
        +UUID reservation_id
        +UUID event_id
        +UUID student_id
        +TicketStatus status
        +DateTime issued_at
        +DateTime checked_in_at
        +checkIn()
    }
    note for Ticket "Chữ ký QR không được lưu: payload được ký HMAC-SHA256 lúc gửi email và xác minh lại lúc check-in."
    note for User "profile_complete là thuộc tính dẫn xuất (true khi có mssv), không phải cột trong CSDL."

    class OutboxMessage {
        +UUID message_id
        +UUID aggregate_id
        +String routing_key
        +OutboxStatus status
        +DateTime created_at
    }
    class AuditLog {
        +UUID log_id
        +UUID actor_user_id
        +String action
        +UUID club_id
        +DateTime created_at
    }
    class Role {
        <<enumeration>>
        SINH_VIEN
        ORGANIZER
        SUPER_ADMIN
    }
    class ReservationStatus {
        <<enumeration>>
        PENDING
        APPROVED
        REJECTED
    }
    class TicketStatus {
        <<enumeration>>
        VALID
        CHECKED_IN
    }
    class EventStatus {
        <<enumeration>>
        OPEN
        CLOSED
    }

    Club "1" --> "0..*" User : tổ chức bởi
    Club "1" --> "0..*" Event : sở hữu
    User "1" --> "0..*" Reservation : gửi
    Event "1" --> "0..*" Reservation : nhận
    Reservation "1" --> "0..1" Ticket : phát hành
    Ticket "1" --> "0..1" OutboxMessage : sinh ra
    User "1" --> "0..*" AuditLog : thực hiện
    User ..> Role
    Reservation ..> ReservationStatus
    Ticket ..> TicketStatus
    Event ..> EventStatus
```

---

## 4. Sơ đồ Tuần tự (Sequence Diagram)

### 4.1 UC-01 — Sinh viên gửi đăng ký giữ chỗ

```mermaid
sequenceDiagram
    actor SV as Sinh viên
    participant FE as Frontend
    participant TS as Monolith — gói ticket
    participant DB as PostgreSQL (tvu_app)

    SV->>FE: Chọn sự kiện, bấm "Đăng ký"
    FE->>TS: POST /api/reservations (cookie JWT + Idempotency-Key)
    TS->>TS: SecurityConfig xác thực JWT và vai trò SINH_VIEN
    TS->>DB: Kiểm tra profile_complete và UNIQUE(event_id, student_id)
    alt Hồ sơ chưa hoàn thiện
        TS-->>FE: 400 Yêu cầu hoàn thiện hồ sơ
    else Đã đăng ký trước đó
        TS-->>FE: 409 Đã đăng ký
    else Hợp lệ
        TS->>DB: INSERT Reservation (PENDING)
        DB-->>TS: OK
        TS-->>FE: 201 Đăng ký thành công, chờ duyệt
    end
    FE-->>SV: Hiển thị kết quả
```

### 4.2 UC-02 — Ban tổ chức duyệt đăng ký (giữ chỗ nguyên tử & phát vé)

```mermaid
sequenceDiagram
    actor BTC as Ban tổ chức
    participant FE as Frontend
    participant TS as Monolith — gói ticket
    participant R as Redis
    participant DB as PostgreSQL (tvu_app)
    participant MQ as RabbitMQ
    participant NS as Monolith — gói notification
    actor SVN as Sinh viên (email)

    BTC->>FE: Bấm "Duyệt" đăng ký
    FE->>TS: PATCH /api/reservations/{id}/approve
    TS->>R: EVAL Lua script DECR remaining
    alt remaining < 0 (hết vé)
        R-->>TS: -1
        TS-->>FE: 409 Hết vé (Reservation vẫn PENDING)
    else còn vé
        R-->>TS: remaining mới (>= 0)
        TS->>DB: BEGIN TRANSACTION
        TS->>DB: UPDATE Reservation SET status = APPROVED
        TS->>DB: INSERT Ticket (status = VALID)
        TS->>DB: INSERT OutboxMessage (status = NEW)
        TS->>DB: COMMIT
        TS-->>FE: 200 Duyệt thành công
        TS->>DB: (Relay) SELECT ... FOR UPDATE SKIP LOCKED
        TS->>MQ: Publish reservation.approved (message-id)
        MQ->>NS: Consume message
        NS->>NS: Sinh mã QR (ký HMAC-SHA256)
        NS->>SVN: Gửi email vé điện tử
    end
```

### 4.3 UC-03 — Điểm danh bằng quét mã QR

```mermaid
sequenceDiagram
    actor BTC as Ban tổ chức
    participant FE as Frontend (camera)
    participant TS as Monolith — gói ticket
    participant DB as PostgreSQL (tvu_app)

    BTC->>FE: Quét mã QR của sinh viên
    FE->>TS: POST /api/tickets/checkin (payload đã ký)
    TS->>TS: Xác minh chữ ký HMAC-SHA256 và hạn dùng
    alt Chữ ký không hợp lệ hoặc hết hạn
        TS-->>FE: 400 Vé không hợp lệ
    else Hợp lệ
        TS->>DB: UPDATE Ticket SET status=CHECKED_IN WHERE status=VALID AND event_id=? AND club_id=?
        alt Số dòng cập nhật = 0 (đã check-in trước đó)
            DB-->>TS: 0 rows
            TS-->>FE: 409 Vé đã được sử dụng
        else Số dòng cập nhật = 1
            DB-->>TS: 1 row
            TS-->>FE: 200 Điểm danh thành công
        end
    end
    FE-->>BTC: Hiển thị kết quả
```

---

## 5. Biểu đồ Dòng Dữ liệu (Data Flow Diagram — DFD)

### 5.1 Mức 0 — Sơ đồ ngữ cảnh (Context Diagram)

```mermaid
flowchart LR
    SV["Sinh viên"]
    BTC["Ban tổ chức"]
    QT["Quản trị viên"]
    MS["Microsoft Identity Platform"]
    SYS(("Hệ thống TVU Event and Ticketing"))

    SV -->|"Yêu cầu đăng ký, thông tin hồ sơ"| SYS
    SYS -->|"Danh sách sự kiện, vé điện tử QR"| SV
    BTC -->|"Tạo sự kiện, duyệt/từ chối, quét QR"| SYS
    SYS -->|"Danh sách đăng ký, dashboard, kết quả check-in"| BTC
    QT -->|"Quản lý tài khoản, danh mục CLB"| SYS
    SYS -->|"Audit log, thống kê toàn trường"| QT
    SV <-->|"Xác thực OAuth2/OIDC"| MS
```

### 5.2 Mức 1 — Phân rã theo tiến trình nghiệp vụ

```mermaid
flowchart TD
    SV["Sinh viên"]
    BTC["Ban tổ chức"]
    MS["Microsoft Identity"]

    P1(("1.0 Xác thực và Hồ sơ"))
    P2(("2.0 Quản lý Sự kiện"))
    P3(("3.0 Đăng ký và Duyệt vé"))
    P4(("4.0 Phát hành vé và Thông báo"))
    P5(("5.0 Điểm danh QR"))
    P6(("6.0 Thống kê và Báo cáo"))

    D1[("User / Club")]
    D2[("Event")]
    D3[("Reservation")]
    D4[("Ticket / Outbox")]
    D5[("AuditLog")]

    SV --> P1
    MS --> P1
    P1 --> D1
    D1 --> P1

    BTC --> P2
    P2 --> D2
    D2 --> P2

    SV --> P3
    BTC --> P3
    P3 --> D3
    D3 --> P3
    P3 -->|"remaining--"| P4

    P4 --> D4
    D4 --> P4
    P4 -->|"Email vé QR"| SV

    BTC --> P5
    P5 --> D4
    D4 --> P5

    BTC --> P6
    P6 --> D3
    P6 --> D4
    P6 --> D5
```

---

## 6. Sơ đồ Thực thể – Quan hệ (ER Diagram)

```mermaid
erDiagram
    CLUB ||--o{ USER : "tổ chức bởi"
    CLUB ||--o{ EVENT : "sở hữu"
    USER ||--o{ RESERVATION : "gửi"
    EVENT ||--o{ RESERVATION : "nhận"
    RESERVATION ||--o| TICKET : "phát hành"
    EVENT ||--|| TICKET_INVENTORY : "có kho vé"
    CLUB ||--o{ TICKET_INVENTORY : "sở hữu"
    EVENT ||--o{ TICKET : "cấp cho"
    USER ||--o{ TICKET : "sở hữu"
    USER ||--o{ AUDIT_LOG : "thực hiện"

    CLUB {
        uuid club_id PK
        string name
        datetime created_at
    }
    USER {
        uuid user_id PK
        string email
        string role
        string mssv
        uuid club_id FK
        string mssv_status
        string status
    }
    EVENT {
        uuid event_id PK
        uuid club_id FK
        string title
        int capacity
        string status
        datetime open_at
        datetime close_at
    }
    RESERVATION {
        uuid reservation_id PK
        uuid event_id FK
        uuid student_id FK
        string status
        string idempotency_key
    }
    TICKET {
        uuid ticket_id PK
        uuid reservation_id FK
        uuid event_id FK
        uuid club_id FK
        uuid student_id FK
        string status
        datetime issued_at
        datetime checked_in_at
        bigint version
    }
    TICKET_INVENTORY {
        uuid inventory_id PK
        uuid event_id FK
        uuid club_id FK
        int total_capacity
        int approved_count
        bigint version
    }
    OUTBOX_MESSAGE {
        uuid message_id PK
        uuid aggregate_id
        string routing_key
        string status
        datetime created_at
    }
    AUDIT_LOG {
        uuid log_id PK
        uuid message_id
        uuid actor_id
        string action
        string target_type
        uuid target_id
        string detail
        datetime created_at
    }
```

---

## 7. Sơ đồ Thành phần & Triển khai (Component/Deployment Diagram)

_Ánh xạ các thành phần đã bàn giao lên một máy chủ duy nhất chạy Docker Compose. Bản trước của sơ đồ này
vẽ năm microservice trên nhiều dịch vụ đám mây rời; kiến trúc đã hợp nhất thành một khối modular monolith
(xem `backend/monolith`) nên sơ đồ được vẽ lại theo `backend/infra/production/compose.yaml`._

```mermaid
flowchart TB
    NET[["Internet"]]

    subgraph VM["Máy chủ Linux (Docker Compose)"]
        subgraph PUBNET["mạng public"]
            CADDY["Caddy 2.10 — HTTPS, reverse proxy"]
            FE["Frontend: React + TypeScript (Nginx)"]
        end
        subgraph APPNET["mạng application (không ra Internet)"]
            MONO["Monolith — Spring Boot 4 / Java 25
gói auth · event · ticket · notification"]
            PG[("PostgreSQL 18.4
một schema: tvu_app")]
            R[("Redis 7.4
bộ đếm sức chứa")]
            MQ{{"RabbitMQ 4.2
reservation.approved + DLQ"}}
        end
    end

    MS[["Microsoft Identity Platform (Entra ID)"]]
    SMTP[["SMTP (nhà cung cấp email)"]]

    NET --> CADDY
    CADDY --> FE
    CADDY -- "/api" --> MONO
    MONO --> PG
    MONO --> R
    MONO -- "outbox relay" --> MQ
    MQ -- "gói notification tiêu thụ" --> MONO
    MONO -. "OIDC xác minh token" .-> MS
    MONO -. "gửi email vé" .-> SMTP

    style VM fill:#E3F2E1,stroke:#3C7A3C,stroke-width:1px
    style PUBNET fill:#E0F7FA,stroke:#00838F,stroke-width:1px
    style APPNET fill:#EAF2FB,stroke:#2E5A8C,stroke-width:1px
```

**Ghi chú triển khai**

- Chỉ Caddy lộ ra Internet. PostgreSQL (5432), Redis (6379) và RabbitMQ (5672 / 15672) nằm trong mạng
  `application` và không publish cổng ra ngoài.
- Frontend và API dùng **cùng một origin** (`VITE_API_BASE_URL=/api`) nên cookie JWT `HttpOnly` hoạt động
  mà không cần cấu hình CORS liên miền.
- RabbitMQ chỉ còn mang `reservation.approved`. Nhật ký kiểm toán (audit) là lời gọi trong tiến trình,
  ghi cùng transaction với thao tác sinh ra nó — không đi qua broker.
