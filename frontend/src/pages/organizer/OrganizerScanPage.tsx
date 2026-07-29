import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import PageHeader from "../../components/common/PageHeader";
import QRScannerPanel from "../../components/tickets/QRScannerPanel";
import { ticketService } from "../../services/ticketService";

export default function OrganizerScanPage() {
  const [cameraPermission, setCameraPermission] = useState<"idle" | "granted" | "denied">("idle");
  const [scanHistory, setScanHistory] = useState<Array<{ code: string; message: string; success: boolean; time: string }>>([]);

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
      await ticketService.checkIn(qrPayload);
      return pushScanHistory(qrPayload, true, "Điểm danh thành công.");
    } catch (error) {
      return pushScanHistory(qrPayload, false, error instanceof Error ? error.message : "QR không hợp lệ hoặc vé đã check-in.");
    }
  }, [pushScanHistory]);

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        title="Quét QR điểm danh"
        description="Quét hoặc nhập mã QR đã gửi cho sinh viên qua email. Hệ thống luôn là nơi xác minh mã hợp lệ hay không."
      />
      <QRScannerPanel onCheckIn={handleCheckIn} cameraPermission={cameraPermission} />
      <section className="enterprise-card p-5">
        <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
          <h2 className="section-heading">Lịch sử check-in gần đây</h2>
          <p className="text-sm font-semibold text-slate-500">Ghi nhận kết quả quét trong phiên hiện tại.</p>
        </div>
        <div className="mt-4 space-y-3">
          {scanHistory.length > 0 ? (
            scanHistory.map((item, index) => (
              <div key={`${item.code}-${index}`} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
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
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              Chưa có lượt quét nào.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
