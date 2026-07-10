export function formatEventStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return "Đang mở đăng ký";
    case "UPCOMING":
      return "Sắp mở đăng ký";
    case "CLOSED":
      return "Đã đóng";
    case "FULL":
      return "Hết vé";
    case "ENDED":
      return "Đã kết thúc";
    default:
      return status;
  }
}

export function formatReservationStatus(status: string): string {
  switch (status) {
    case "PENDING":
      return "Chờ duyệt";
    case "APPROVED":
      return "Đã duyệt";
    case "REJECTED":
      return "Bị từ chối";
    default:
      return status;
  }
}

export function formatTicketStatus(status: string, checkInStatus?: string): string {
  if (checkInStatus === "CHECKED_IN") {
    return "Đã điểm danh";
  }

  switch (status) {
    case "VALID":
      return "Hợp lệ";
    case "EXPIRED":
      return "Hết hạn";
    case "INVALID":
      return "Không hợp lệ";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

export function formatUserStatus(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Đang hoạt động";
    case "LOCKED":
      return "Đã khóa";
    default:
      return status;
  }
}
