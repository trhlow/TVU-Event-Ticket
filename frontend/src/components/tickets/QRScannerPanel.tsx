import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { QrCode, Search, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";

interface QRScannerPanelProps {
  onCheckIn: (ticketCode: string) => Promise<{ success: boolean; message: string }>;
  cameraPermission: "idle" | "granted" | "denied";
}

export default function QRScannerPanel({
  onCheckIn,
  cameraPermission,
}: QRScannerPanelProps) {
  const [ticketCode, setTicketCode] = useState("");
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Guards against overlapping onCheckIn calls while a request is in flight.
  const isProcessingRef = useRef(false);
  // Tracks the last decoded value that was submitted so the same QR sitting in frame doesn't get
  // resubmitted on every animation frame. Cleared as soon as a frame decodes no QR at all, so moving
  // the ticket out of view (even briefly) is what re-arms scanning — not a fixed timeout.
  const lastScannedCodeRef = useRef<string | null>(null);

  const handleScanSubmit = async (codeToScan: string) => {
    const code = codeToScan || ticketCode;
    // Shares the same in-flight guard as the camera loop below, so a manual submit while a camera
    // scan is still resolving (or a double-click on the button) can't fire a second request.
    if (!code.trim() || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsManualSubmitting(true);
    try {
      const result = await onCheckIn(code.trim());
      setScanResult(result);
      setTicketCode("");
    } finally {
      isProcessingRef.current = false;
      setIsManualSubmitting(false);
    }
  };

  useEffect(() => {
    if (cameraPermission !== "granted") return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;

    async function startScanning() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        return;
      }
      if (cancelled || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { willReadFrequently: true });

      const tick = () => {
        if (cancelled) return;
        const video = videoRef.current;
        if (video && canvas && context && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (!code?.data) {
            // Nothing in frame right now — the next QR shown (even if it's the same ticket) counts
            // as a fresh scan.
            lastScannedCodeRef.current = null;
          } else if (!isProcessingRef.current && code.data !== lastScannedCodeRef.current) {
            isProcessingRef.current = true;
            lastScannedCodeRef.current = code.data;
            void onCheckIn(code.data).then((result) => {
              setScanResult(result);
              isProcessingRef.current = false;
            });
          }
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    void startScanning();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      lastScannedCodeRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraPermission, onCheckIn]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm max-w-5xl mx-auto text-left space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <div className="p-2 bg-brand-50 text-brand-600 rounded-xl">
          <QrCode className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h4 className="text-base font-bold text-gray-950 tracking-tight">
            Cổng quét vé điểm danh sự kiện
          </h4>
          <p className="text-[11px] text-gray-500 font-semibold mt-0.5">
            Khu vực quét QR Code vé điện tử phục vụ đón tiếp sinh viên
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner panel */}
        <>
          <div className="bg-gray-950 rounded-2xl p-4 flex flex-col items-center justify-center text-center relative border border-gray-800 h-60 overflow-hidden">
            {cameraPermission === "idle" && (
              <div className="relative z-10 flex flex-col items-center gap-3 px-6">
                <RefreshCw className="w-12 h-12 text-brand-300 animate-spin" />
                <span className="text-[10px] text-brand-100 font-bold uppercase tracking-widest block leading-none">
                  Đang xin quyền camera
                </span>
              </div>
            )}

            {cameraPermission === "denied" && (
              <div className="relative z-10 flex flex-col items-center gap-3 px-6">
                <AlertCircle className="w-12 h-12 text-amber-400" />
                <p className="text-xs text-gray-100 font-bold leading-relaxed max-w-sm">
                  Không thể truy cập camera. Vui lòng nhập mã vé thủ công bên dưới
                  hoặc cấp quyền camera trong cài đặt trình duyệt.
                </p>
              </div>
            )}

            <video
              ref={videoRef}
              muted
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${cameraPermission === "granted" ? "" : "hidden"}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {cameraPermission === "granted" && (
              <>
                {/* Visual camera guides */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-brand-500 z-10"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-brand-500 z-10"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-brand-500 z-10"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-brand-500 z-10"></div>

                {/* Scanning line animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-brand-500 animate-scan-line top-1/2 z-10"></div>
              </>
            )}
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-brand-800 uppercase tracking-wider block">
                Dán nội dung QR
              </label>
              <p className="text-[11px] text-gray-500 font-semibold">
                Dùng khi camera chưa sẵn sàng: dán toàn bộ nội dung mã QR đã quét được (không phải mã vé rút gọn).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Dán nội dung QR đã quét tại đây..."
                value={ticketCode}
                onChange={(e) => setTicketCode(e.target.value)}
                disabled={isManualSubmitting}
                className="min-h-12 flex-1 bg-white border border-brand-200 rounded-xl px-4 py-3 text-sm font-mono font-black text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                onClick={() => handleScanSubmit("")}
                disabled={isManualSubmitting}
                className="min-h-12 px-5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-extrabold shadow-sm cursor-pointer flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search className="w-4 h-4" /> {isManualSubmitting ? "Đang xử lý..." : "Check-in"}
              </button>
            </div>
          </div>
        </>

      </div>

      {/* Result feedback message */}
      {scanResult && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 animate-fade-in ${
            scanResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          {scanResult.success ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-left space-y-1">
            <h5 className="text-xs font-black uppercase tracking-wider">
              {scanResult.success
                ? "Hợp lệ - Điểm danh thành công!"
                : "Lỗi - Quét thất bại"}
            </h5>
            <p className="text-[11px] font-semibold leading-relaxed">
              {scanResult.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
