import { Construction, X } from "lucide-react";
import { Link } from "react-router-dom";
import { NotificationScope, notificationCopy } from "../../pages/common/NotificationsPage";

const notificationsPathByScope: Record<NotificationScope, string> = {
  student: "/student/notifications",
  organizer: "/organizer/notifications",
  admin: "/admin/notifications",
};

interface NotificationsPanelProps {
  scope: NotificationScope;
  onClose: () => void;
}

export default function NotificationsPanel({ scope, onClose }: NotificationsPanelProps) {
  const copy = notificationCopy[scope];

  return (
    <div
      role="dialog"
      aria-label="Thông báo"
      className="absolute right-0 top-full z-40 mt-2 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-blue-100 bg-white text-left shadow-xl sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-black text-slate-900">{copy.title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="btn-press grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto px-4 py-5 text-center">
        <div className="icon-float mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Construction className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mx-auto mt-3 max-w-xs text-xs font-semibold leading-5 text-slate-500">{copy.description}</p>
        <p className="mx-auto mt-3 max-w-xs text-xs font-semibold leading-5 text-slate-400">
          Backend chưa có API danh sách thông báo — mục này sẽ hiển thị thông báo thật ngay khi endpoint sẵn sàng.
        </p>
      </div>

      <div className="border-t border-slate-100 px-4 py-3 text-center">
        <Link
          to={notificationsPathByScope[scope]}
          onClick={onClose}
          className="text-xs font-bold text-brand-700 hover:text-brand-800"
        >
          Xem tất cả thông báo
        </Link>
      </div>
    </div>
  );
}
