import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Breadcrumb from "../../components/common/Breadcrumb";
import Toast from "../../components/common/Toast";
import QRScannerPanel from "../../components/tickets/QRScannerPanel";
import { getEvents } from "../../data/mockEvents";
import { ticketService } from "../../services/ticketService";
import { Ticket } from "../../types/ticket";

export default function OrganizerScanPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
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

  const handleCheckIn = async (qrPayload: string) => {
    try {
      const ticket = await ticketService.checkIn(qrPayload);
      setTickets((items) => [ticket, ...items.filter((item) => item.id !== ticket.id)]);
      return pushScanHistory(qrPayload, true, "Diem danh thanh cong.");
    } catch (error) {
      return pushScanHistory(qrPayload, false, error instanceof Error ? error.message : "QR khong hop le hoac ve da check-in.");
    }
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
      <Breadcrumb items={[{ label: "Ban to chuc", path: "/organizer" }, { label: "Quet QR diem danh" }]} />
      <div>
        <h1 className="tvu-page-title text-2xl">Quet QR diem danh</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Nhap QR payload signed do backend/notification cap. Frontend khong tu ky QR.</p>
      </div>
      <QRScannerPanel tickets={tickets} events={events} onCheckIn={handleCheckIn} cameraPermission={cameraPermission} />
      <section className="enterprise-card p-5">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
          <h2 className="section-heading">Lich su check-in gan day</h2>
          <p className="text-sm font-semibold text-slate-500">Ghi nhan ket qua quet trong phien hien tai.</p>
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
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">Chua co luot quet nao.</div>
          )}
        </div>
      </section>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
