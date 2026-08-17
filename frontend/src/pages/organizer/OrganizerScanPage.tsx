import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import QRScannerPanel from "../../components/tickets/QRScannerPanel";
import { ticketService } from "../../services/ticketService";
import { eventService } from "../../services/eventService";
import { Event } from "../../types/event";
import SectionCard from "../../components/common/SectionCard";

export default function OrganizerScanPage() {
  const { eventId } = useParams<{ eventId?: string }>();
  const [scopedEvent, setScopedEvent] = useState<Event | undefined>();
  const [cameraPermission, setCameraPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; message: string; success: boolean; time: string }>>([]);

  useEffect(() => {
    let mounted = true;
    if (!eventId) {
      setScopedEvent(undefined);
      return;
    }
    void eventService.getByIdRemote(eventId).then((event) => {
      if (mounted) setScopedEvent(event);
    });
    return () => {
      mounted = false;
    };
  }, [eventId]);

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

  // Stable identity (useCallback with empty deps, only setState calls inside) so passing this to
  // QRScannerPanel's onCheckIn prop doesn't re-trigger its camera-opening effect after every scan.
  const pushScanHistory = useCallback((code: string, success: boolean, message: string) => {
    const result = { success, message };
    setScanHistory((items) => [
      { code: code.trim(), success, message, time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) },
      ...items,
    ].slice(0, 6));
    return result;
  }, []);

  const handleCheckIn = useCallback(async (qrPayload: string) => {
    try {
      const ticket = await ticketService.checkIn(qrPayload);
      // Backend check-in has no expectedEventId param — it accepts any valid signed QR regardless
      // of which event this screen is scoped to. Detect the mismatch after the fact so the
      // check-in getting recorded under the wrong event is at least visible, not silent.
      if (eventId && ticket.eventId !== eventId) {
        return pushScanHistory(
          qrPayload,
          false,
          "Cảnh báo: vé hợp lệ nhưng thuộc một sự kiện khác của CLB. Điểm danh vẫn đã được ghi nhận trên hệ thống — vui lòng đối chiếu lại thủ công.",
        );
      }
      return pushScanHistory(qrPayload, true, "Điểm danh thành công.");
    } catch (error) {
      return pushScanHistory(qrPayload, false, error instanceof Error ? error.message : "QR không hợp lệ hoặc vé đã check-in.");
    }
  }, [pushScanHistory, eventId]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title={eventId ? `Quét QR điểm danh — ${scopedEvent?.title || "Đang tải sự kiện..."}` : "Quét QR điểm danh"}
        description="Quét hoặc nhập mã QR đã gửi cho sinh viên qua email. Hệ thống luôn là nơi xác minh mã hợp lệ hay không."
      />
      {eventId && (
        <div className="flex gap-3 rounded-card border border-warning-200 bg-warning-50 p-4 text-sm font-semibold leading-6 text-warning-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
          <span>
            Máy chủ chưa hỗ trợ giới hạn check-in theo từng sự kiện — một vé hợp lệ của sự kiện khác cùng CLB vẫn có
            thể được quét thành công tại đây. Hệ thống sẽ cảnh báo nếu phát hiện vé không thuộc sự kiện này.
          </span>
        </div>
      )}
      <QRScannerPanel onCheckIn={handleCheckIn} cameraPermission={cameraPermission} />
      <SectionCard title="Lịch sử check-in gần đây" description="Ghi nhận kết quả quét trong phiên hiện tại.">
        <div className="space-y-3">
          {scanHistory.length > 0 ? (
            scanHistory.map((item, index) => (
              <div key={`${item.code}-${index}`} className="flex items-start gap-3 rounded-card border border-slate-100 bg-slate-50 p-3">
                {item.success ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-success-600" aria-hidden="true" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 text-danger-600" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-black text-slate-950">{item.code}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{item.message}</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{item.time}</span>
              </div>
            ))
          ) : (
            <div className="rounded-card border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              Chưa có lượt quét nào.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
