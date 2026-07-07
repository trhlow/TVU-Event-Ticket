import React, { useState } from 'react';
import { Save, Server, Shield, HardDrive } from 'lucide-react';
import Breadcrumb from '../../components/common/Breadcrumb';
import Toast from '../../components/common/Toast';

export default function SuperAdminSettingsPage() {
  const [settings, setSettings] = useState({
    systemName: 'TVU Event Ticket',
    systemDomain: 'ticket.tvu.edu.vn',
    ticketLimitPerStudent: 3,
    allowedEmailDomain: '@tvu.edu.vn',
    autoApproveFreeEvents: false,
    maintenanceMode: false,
    backupInterval: 'Hàng ngày',
  });
  const [toastMsg, setToastMsg] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setToastMsg('Đã cập nhật cấu hình hệ thống TVU Event Ticket.');
  };

  return (
    <div className="space-y-6 text-left animate-fade-in">
      <Breadcrumb items={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Cấu hình hệ thống' }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Cấu Hình & Thiết Lập Hệ Thống</h2>
        <p className="text-xs text-gray-500 font-semibold font-sans">Điều chỉnh các thông số vận hành máy chủ, chính sách hạn ngạch vé điện tử, tên miền và các rào cản bảo mật dữ liệu</p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Form */}
        <div className="lg:col-span-2 space-y-6 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
            <Server className="w-5 h-5 text-brand-600" />
            <h3 className="font-extrabold text-gray-950 text-sm">Cấu hình máy chủ & định danh</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tên hệ thống</label>
              <input 
                type="text" 
                value={settings.systemName}
                onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tên miền hệ thống</label>
              <input 
                type="text" 
                value={settings.systemDomain}
                onChange={(e) => setSettings({ ...settings, systemDomain: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tên miền Email được phép đăng ký</label>
              <input 
                type="text" 
                value={settings.allowedEmailDomain}
                onChange={(e) => setSettings({ ...settings, allowedEmailDomain: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500"
                placeholder="@tvu.edu.vn"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Hạn mức vé tối đa / Sinh viên</label>
              <input 
                type="number" 
                value={settings.ticketLimitPerStudent}
                onChange={(e) => setSettings({ ...settings, ticketLimitPerStudent: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 pb-4 border-b border-gray-100">
            <Shield className="w-5 h-5 text-brand-600" />
            <h3 className="font-extrabold text-gray-950 text-sm">Quy tắc tự động & Bảo mật</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-900">Tự động duyệt vé đối với sự kiện miễn phí</p>
                <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">Học viên đăng ký sự kiện học thuật sẽ trực tiếp nhận vé QR mà không cần CLB phê duyệt</p>
              </div>
              <input 
                type="checkbox" 
                checked={settings.autoApproveFreeEvents}
                onChange={(e) => setSettings({ ...settings, autoApproveFreeEvents: e.target.checked })}
                className="w-4 h-4 text-brand-600 border-gray-300 rounded-sm focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-900">Kích hoạt chế độ bảo trì hệ thống</p>
                <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">Chỉ có tài khoản Super Admin được quyền đăng nhập vào hệ thống khi bảo trì</p>
              </div>
              <input 
                type="checkbox" 
                checked={settings.maintenanceMode}
                onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                className="w-4 h-4 text-brand-600 border-gray-300 rounded-sm focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="pt-4 text-right">
            <button
              type="submit"
              className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold tracking-tight transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-brand-600/10"
            >
              <Save className="w-4 h-4" /> Lưu cấu hình hệ thống
            </button>
          </div>
        </div>

        {/* Server Health Metric info */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <HardDrive className="w-5 h-5 text-brand-600" />
              <h3 className="font-extrabold text-gray-950 text-sm">Trạng thái hạ tầng</h3>
            </div>

            <div className="space-y-3 text-xs text-gray-600 font-semibold">
              <div className="flex justify-between">
                <span className="text-gray-400">Hệ điều hành</span>
                <span>Linux (Ubuntu Server)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Phiên bản Node.js</span>
                <span>v18.19.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Cơ sở dữ liệu</span>
                <span>Dung lượng: 12.5 MB (PostgreSQL)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Chu kỳ Sao lưu</span>
                <select 
                  value={settings.backupInterval}
                  onChange={(e) => setSettings({ ...settings, backupInterval: e.target.value })}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] font-semibold focus:outline-hidden"
                >
                  <option value="Hàng giờ">Hàng giờ</option>
                  <option value="Hàng ngày">Hàng ngày</option>
                  <option value="Hàng tuần">Hàng tuần</option>
                </select>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Thời gian hoạt động</span>
                <span className="text-emerald-600 font-bold">99.98% (Live)</span>
              </div>
            </div>
          </div>
        </div>
      </form>
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
