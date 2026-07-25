export type NotificationScope = "student" | "organizer" | "admin";

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
