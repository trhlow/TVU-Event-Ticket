import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; message: string; success: boolean; time: string }>>([]);
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
      return pushScanHistory(ticketCode, false, "QR không hợp lệ. Mã vé này không tồn tại trong hệ thống.");
    }

    const ticket = allTickets[targetTicketIndex];
    if (eventId && ticket.eventId !== eventId) {
      return pushScanHistory(ticketCode, false, "QR không thuộc sự kiện này. Vui lòng kiểm tra đúng cổng điểm danh.");
    }

    if (ticket.status !== "VALID") {
      return pushScanHistory(ticketCode, false, "QR không hợp lệ. Vé đã bị hủy hoặc không còn giá trị sử dụng.");
    }

    if (ticket.checkInStatus === "CHECKED_IN") {
      return pushScanHistory(
        ticketCode,
        false,
        `Vé đã được điểm danh trước đó lúc ${ticket.checkInAt ? new Date(ticket.checkInAt).toLocaleTimeString("vi-VN") : "không xác định"}.`,
      );
    }

    allTickets[targetTicketIndex].checkInStatus = "CHECKED_IN";
    allTickets[targetTicketIndex].checkInAt = new Date().toISOString();
    saveTickets(allTickets);
    setTickets(allTickets);

    const student = mockUsers.find((user) => user.id === ticket.studentId);
    const studentNameLabel = student ? `${student.fullName} (${student.mssv})` : "Sinh viên";
    return pushScanHistory(ticketCode, true, `Điểm danh thành công cho ${studentNameLabel}.`);
  };

  const pushScanHistory = (code: string, success: boolean, message: string) => {
    const result = { success, message };
    setScanHistory((items) => [
      { code: code.trim(), success, message, time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) },
      ...items,
    ].slice(0, 6));
    return result;
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
      <section className="enterprise-card p-5">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
          <h2 className="section-heading">Lịch sử check-in gần đây</h2>
          <p className="text-sm font-semibold text-slate-500">Ghi nhận nhanh kết quả quét trong phiên thao tác hiện tại.</p>
        </div>
        <div className="mt-4 space-y-3">
          {scanHistory.length > 0 ? (
            scanHistory.map((item, index) => (
              <div key={`${item.code}-${index}`} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                {item.success ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-black text-slate-950">{item.code}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{item.message}</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{item.time}</span>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              Chưa có lượt quét nào trong phiên hiện tại.
            </div>
          )}
        </div>
      </section>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
