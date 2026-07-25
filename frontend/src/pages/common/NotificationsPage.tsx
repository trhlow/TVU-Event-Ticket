import { Bell } from "lucide-react";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import PageHeader from "../../components/common/PageHeader";
import { requireCurrentUser } from "../../state/authSession";
import { NotificationScope, notificationCopy } from "../../constants/notifications";

interface NotificationsPageProps {
  scope: NotificationScope;
}

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
