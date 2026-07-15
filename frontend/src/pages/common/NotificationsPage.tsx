import { Bell } from "lucide-react";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import { getCurrentUser } from "../../state/authSession";

type NotificationScope = "student" | "organizer" | "admin";

interface NotificationsPageProps {
  scope: NotificationScope;
}

const notificationCopy: Record<NotificationScope, { title: string; description: string; endpoints: string[] }> = {
  student: {
    title: "Thông báo của tôi",
    description: "Theo dõi trạng thái đăng ký, lịch sự kiện và vé QR đã được Ban tổ chức phát hành.",
    endpoints: ["GET /notifications/me"],
  },
  organizer: {
    title: "Thông báo Ban tổ chức",
    description: "Các việc cần xử lý của CLB: đăng ký mới, phát vé QR và chuẩn bị check-in.",
    endpoints: ["GET /notifications/organizer"],
  },
  admin: {
    title: "Thông báo quản trị",
    description: "Cảnh báo hệ thống, hoạt động CLB và nhật ký vận hành toàn trường.",
    endpoints: ["GET /notifications/admin"],
  },
};

export default function NotificationsPage({ scope }: NotificationsPageProps) {
  const user = getCurrentUser();
  const page = notificationCopy[scope];

  return (
    <div className="space-y-6 text-left">
      <section className="page-hero p-5 text-white md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              <Bell className="h-4 w-4" /> Trung tâm thông báo
            </p>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">{page.title}</h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/82">{page.description}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/12 px-5 py-4 backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Người nhận</p>
            <p className="mt-1 max-w-56 truncate text-base font-semibold text-white">{user.fullName}</p>
          </div>
        </div>
      </section>

      <BackendPendingNotice
        description="Notification-service hiện gửi email bất đồng bộ sau khi đăng ký được duyệt nhưng chưa expose API danh sách thông báo trong ứng dụng. Trang này sẽ hiển thị thông báo thật ngay khi endpoint bên dưới sẵn sàng — trạng thái đăng ký/vé vẫn theo dõi trực tiếp tại các trang tương ứng."
        requiredEndpoints={page.endpoints}
      />
    </div>
  );
}
