import { Bell, CalendarClock, CheckCircle2, ClipboardCheck, QrCode, ShieldAlert } from "lucide-react";
import Button from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import { getCurrentUser } from "../../data/mockAuth";

type NotificationScope = "student" | "organizer" | "admin";

interface NotificationsPageProps {
  scope: NotificationScope;
}

const notificationCopy = {
  student: {
    title: "Thông báo của tôi",
    description: "Theo dõi trạng thái đăng ký, lịch sự kiện và vé QR đã được Ban tổ chức phát hành.",
    primaryAction: "Xem đăng ký",
    items: [
      {
        title: "Đăng ký đang chờ duyệt",
        description: "Workshop Công nghệ Web & Trí tuệ nhân tạo đang được Ban tổ chức xem xét.",
        time: "Hôm nay, 09:15",
        tone: "warning",
        icon: ClipboardCheck,
      },
      {
        title: "Vé QR đã sẵn sàng",
        description: "Đêm nhạc acoustic đã được duyệt và vé QR cá nhân đã được phát hành.",
        time: "Hôm qua, 15:30",
        tone: "success",
        icon: QrCode,
      },
      {
        title: "Nhắc lịch tham gia",
        description: "Sự kiện bắt đầu lúc 18:30 tại Sân trung tâm học tập sinh viên.",
        time: "20/07/2026, 08:00",
        tone: "neutral",
        icon: CalendarClock,
      },
    ],
  },
  organizer: {
    title: "Thông báo Ban tổ chức",
    description: "Các việc cần xử lý của CLB: duyệt đăng ký, phát vé QR và chuẩn bị check-in.",
    primaryAction: "Mở hàng chờ duyệt",
    items: [
      {
        title: "Có đăng ký mới cần duyệt",
        description: "4 sinh viên vừa gửi đăng ký tham gia sự kiện của CLB.",
        time: "Hôm nay, 10:20",
        tone: "warning",
        icon: ClipboardCheck,
      },
      {
        title: "Phiên check-in sắp mở",
        description: "Kiểm tra máy quét QR và danh sách vé hợp lệ trước khi đón sinh viên.",
        time: "Hôm nay, 16:00",
        tone: "neutral",
        icon: QrCode,
      },
      {
        title: "Tỷ lệ duyệt ổn định",
        description: "Các vé chỉ được phát hành sau khi đăng ký đã được duyệt.",
        time: "Hôm qua, 17:45",
        tone: "success",
        icon: CheckCircle2,
      },
    ],
  },
  admin: {
    title: "Thông báo quản trị",
    description: "Theo dõi cảnh báo hệ thống, hoạt động CLB và nhật ký vận hành toàn trường.",
    primaryAction: "Xem nhật ký hệ thống",
    items: [
      {
        title: "Hoạt động duyệt tăng cao",
        description: "CLB Guitar có nhiều đăng ký mới, cần theo dõi khả năng quá tải sự kiện.",
        time: "Hôm nay, 11:10",
        tone: "warning",
        icon: ShieldAlert,
      },
      {
        title: "Tài khoản Ban tổ chức hoạt động",
        description: "Không có đăng nhập bất thường trong 24 giờ gần nhất.",
        time: "Hôm nay, 08:00",
        tone: "success",
        icon: CheckCircle2,
      },
      {
        title: "Báo cáo hệ thống đã cập nhật",
        description: "Thống kê toàn trường đã đồng bộ số liệu vé QR và check-in mới nhất.",
        time: "Hôm qua, 22:00",
        tone: "neutral",
        icon: CalendarClock,
      },
    ],
  },
};

const toneClass = {
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutral: "border-brand-100 bg-brand-50 text-brand-700",
};

export default function NotificationsPage({ scope }: NotificationsPageProps) {
  const user = getCurrentUser();
  const page = notificationCopy[scope];

  return (
    <div className="space-y-6 text-left">
      <section className="page-hero p-6 text-white md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white/80">
              <Bell className="h-4 w-4" /> Trung tâm thông báo
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight md:text-5xl">{page.title}</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/82">{page.description}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-4 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Người nhận</p>
            <p className="mt-1 max-w-56 truncate text-lg font-black text-white">{user.fullName}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="enterprise-card overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="section-heading">Thông báo mới</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Các cập nhật quan trọng được sắp theo thời gian gần nhất.</p>
          </div>
          {page.items.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {page.items.map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="grid gap-4 p-5 transition hover:bg-brand-50/40 sm:grid-cols-[48px_1fr_auto] sm:items-start">
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl border ${toneClass[item.tone as keyof typeof toneClass]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-extrabold text-slate-950">{item.title}</h3>
                      <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{item.description}</p>
                    </div>
                    <p className="text-xs font-bold text-slate-400 sm:text-right">{item.time}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Chưa có thông báo" description="Khi hệ thống có cập nhật mới, thông báo sẽ xuất hiện tại đây." icon={Bell} />
          )}
        </div>

        <aside className="enterprise-card h-fit p-5">
          <h2 className="section-heading">Việc nên xử lý</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
            Ưu tiên kiểm tra các thông báo ảnh hưởng đến đăng ký, vé QR và phiên check-in đang diễn ra.
          </p>
          <Button className="mt-5 w-full">{page.primaryAction}</Button>
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Nguyên tắc nghiệp vụ</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              Vé QR chỉ được phát hành sau khi đăng ký được duyệt. Check-in hợp lệ chỉ ghi nhận một lần cho mỗi vé.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}
