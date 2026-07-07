import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import QRScannerPanel from "../../components/tickets/QRScannerPanel";
import { getEvents } from "../../data/mockEvents";
import { getTickets, saveTickets } from "../../data/mockTickets";
import { mockUsers } from "../../data/mockUsers";

export default function OrganizerScanPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [tickets, setTickets] = useState(() => getTickets());
  const [cameraPermission, setCameraPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [toastMsg, setToastMsg] = useState("");
  const events = getEvents();

  useEffect(() => {
    let cancelled = false;
    const requestCameraPermission = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraPermission("denied");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop());
        if (!cancelled) setCameraPermission("granted");
      } catch {
        if (!cancelled) setCameraPermission("denied");
      }
    };
    requestCameraPermission();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckIn = (ticketCode: string) => {
    const allTickets = getTickets();
    const targetTicketIndex = allTickets.findIndex((ticket) => ticket.ticketCode.trim().toLowerCase() === ticketCode.trim().toLowerCase());

    if (targetTicketIndex === -1) {
      return { success: false, message: "QR không hợp lệ. Mã vé này không tồn tại trong hệ thống." };
    }

    const ticket = allTickets[targetTicketIndex];
    if (eventId && ticket.eventId !== eventId) {
      return { success: false, message: "QR không thuộc sự kiện này. Vui lòng kiểm tra đúng cổng điểm danh." };
    }

    if (ticket.status !== "VALID") {
      return { success: false, message: "QR không hợp lệ. Vé đã bị hủy hoặc không còn giá trị sử dụng." };
    }

    if (ticket.checkInStatus === "CHECKED_IN") {
      return {
        success: false,
        message: `Vé đã được điểm danh trước đó lúc ${ticket.checkInAt ? new Date(ticket.checkInAt).toLocaleTimeString("vi-VN") : "không xác định"}.`,
      };
    }

    allTickets[targetTicketIndex].checkInStatus = "CHECKED_IN";
    allTickets[targetTicketIndex].checkInAt = new Date().toISOString();
    saveTickets(allTickets);
    setTickets(allTickets);

    const student = mockUsers.find((user) => user.id === ticket.studentId);
    const studentNameLabel = student ? `${student.fullName} (${student.mssv})` : "Sinh viên";
    return { success: true, message: `Điểm danh thành công cho ${studentNameLabel}.` };
  };

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Ban tổ chức", path: "/organizer" }, { label: "Quét QR điểm danh" }]} />
      <div>
        <h1 className="tvu-page-title text-2xl">Quét QR điểm danh</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
          Cổng này chỉ quét QR vé điện tử cá nhân của sinh viên. QR đăng ký sự kiện không dùng để điểm danh.
        </p>
      </div>
      <QRScannerPanel tickets={tickets} events={events} onCheckIn={handleCheckIn} cameraPermission={cameraPermission} />
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
