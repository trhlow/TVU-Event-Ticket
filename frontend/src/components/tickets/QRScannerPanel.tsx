import React, { useState } from "react";
import { QrCode, Search, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import { Ticket } from "../../types/ticket";
import { Event } from "../../types/event";

interface QRScannerPanelProps {
  tickets: Ticket[];
  events: Event[];
  onCheckIn: (ticketCode: string) => Promise<{ success: boolean; message: string }>;
  cameraPermission: "idle" | "granted" | "denied";
}

export default function QRScannerPanel({
  tickets,
  events,
  onCheckIn,
  cameraPermission,
}: QRScannerPanelProps) {
  const [ticketCode, setTicketCode] = useState("");
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Danh sách vé hợp lệ giúp thao tác nhanh khi thiết bị quét chưa sẵn sàng.
  const pendingTickets = tickets.filter(
    (t) => t.status === "VALID" && t.checkInStatus === "PENDING",
  );

  const handleScanSubmit = async (codeToScan: string) => {
    const code = codeToScan || ticketCode;
    if (!code.trim()) return;

    const result = await onCheckIn(code.trim());
    setScanResult(result);
    setTicketCode("");
  };

  const getEventTitle = (eventId: string) => {
    return events.find((e) => e.id === eventId)?.title || "Sự kiện không xác định";
  };

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

            {cameraPermission === "granted" && (
              <>
                {/* Visual camera guides */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-brand-500"></div>
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-brand-500"></div>
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-brand-500"></div>
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-brand-500"></div>

                <QrCode className="w-16 h-16 text-gray-700/80 mb-3" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block leading-none">
                  MÁY QUÉT SẴN SÀNG
                </span>

                {/* Scanning line animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-brand-500 shadow-md shadow-brand-500/50 animate-scan-line top-1/2"></div>
              </>
            )}
          </div>

          <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <label className="text-[11px] font-black text-brand-800 uppercase tracking-wider block">
                Nhập mã vé thủ công
              </label>
              <p className="text-[11px] text-gray-500 font-semibold">
                Dùng khi camera chưa sẵn sàng hoặc khu vực check-in quá đông.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Ví dụ: TVU-IT1-93A8B"
                value={ticketCode}
                onChange={(e) => setTicketCode(e.target.value)}
                className="min-h-12 flex-1 bg-white border border-brand-200 rounded-xl px-4 py-3 text-sm font-mono font-black text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                onClick={() => handleScanSubmit("")}
                className="min-h-12 px-5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-extrabold shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Search className="w-4 h-4" /> Check-in
              </button>
            </div>
          </div>
        </>

        {/* Manual check-in helper panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 text-xs font-semibold text-amber-900 space-y-2">
            <p className="font-extrabold flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-amber-600" /> Công cụ hỗ trợ nhập
              mã:
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed font-semibold">
              Nhấp trực tiếp vào danh sách vé hợp lệ dưới đây để kiểm tra phản hồi
              tức thời của máy quét mà không cần nhập phím.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
              Danh sách vé chờ điểm danh ({pendingTickets.length})
            </span>
            <div className="border border-gray-100 rounded-xl overflow-hidden max-h-44 overflow-y-auto divide-y divide-gray-100 bg-gray-50/20">
              {pendingTickets.length > 0 ? (
                pendingTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleScanSubmit(t.ticketCode)}
                    className="w-full text-left p-2.5 text-[11px] font-semibold hover:bg-brand-50/50 hover:text-brand-900 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <span className="font-bold text-gray-900 font-mono block">
                        {t.ticketCode}
                      </span>
                      <span className="text-[10px] text-gray-400 mt-0.5 block truncate max-w-[200px]">
                        {getEventTitle(t.eventId)}
                      </span>
                    </div>
                    <span className="text-[9px] bg-white border border-gray-200 px-2 py-0.5 rounded-md font-bold text-gray-500">
                      Chọn quét
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-[11px] text-gray-400 font-bold">
                  Không còn vé nào đang ở trạng thái chờ điểm danh
                </div>
              )}
            </div>
          </div>
        </div>
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
