import { Bell } from "lucide-react";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import PageHeader from "../../components/common/PageHeader";
import { requireCurrentUser } from "../../state/authSession";

export type NotificationScope = "student" | "organizer" | "admin";

interface NotificationsPageProps {
  scope: NotificationScope;
}

export const notificationCopy: Record<NotificationScope, { title: string; description: string; endpoints: string[] }> = {
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
  const user = requireCurrentUser();
  const page = notificationCopy[scope];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        eyebrow="Trung tâm thông báo"
        icon={Bell}
        title={page.title}
        description={page.description}
        actions={
          <span className="inline-flex max-w-56 items-center gap-1.5 truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
            {user.fullName}
          </span>
        }
      />

      <BackendPendingNotice
        description="Notification-service hiện gửi email bất đồng bộ sau khi đăng ký được duyệt nhưng chưa expose API danh sách thông báo trong ứng dụng. Trang này sẽ hiển thị thông báo thật ngay khi endpoint bên dưới sẵn sàng — trạng thái đăng ký/vé vẫn theo dõi trực tiếp tại các trang tương ứng."
        requiredEndpoints={page.endpoints}
      />
    </div>
  );
}
