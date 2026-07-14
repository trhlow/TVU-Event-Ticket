import React, { useState } from 'react';
import { User, Mail, Bookmark, Save, CreditCard } from 'lucide-react';
import { getCurrentUser, setCurrentUser } from '../../state/authSession';
import Toast from '../../components/common/Toast';
import Breadcrumb from '../../components/common/Breadcrumb';

export default function StudentProfilePage() {
  const currentUser = getCurrentUser();

  const [mssv, setMssv] = useState(currentUser.mssv || '');
  const [className, setClassName] = useState(currentUser.className || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [toastMsg, setToastMsg] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedUser = {
      ...currentUser,
      mssv: mssv.trim(),
      className: className.trim().toUpperCase(),
      phone: phone.trim(),
      profileComplete: !!(mssv.trim() && className.trim()),
    };

    setCurrentUser(updatedUser);
    setToastMsg('Cập nhật thông tin tài khoản thành công!');
    
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="space-y-6 text-left max-w-2xl mx-auto">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Tài khoản' }]} />

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-950 tracking-tight">Hồ Sơ Cá Nhân Sinh Viên</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">Quản lý thông tin định danh số phục vụ hoạt động sự kiện Đoàn Hội</p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Họ và tên</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={currentUser.fullName}
                disabled
                className="w-full bg-gray-100 border border-gray-200 text-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold"
              />
            </div>
            <p className="text-[10px] text-gray-400 font-semibold">Đồng bộ từ tài khoản Microsoft Office 365 nội bộ.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Địa chỉ Email học tập</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={currentUser.email}
                disabled
                className="w-full bg-gray-100 border border-gray-200 text-gray-500 rounded-xl pl-10 pr-4 py-2.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mã số sinh viên (MSSV)</label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ví dụ: 110121001"
                  value={mssv}
                  onChange={(e) => setMssv(e.target.value)}
                  maxLength={12}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-gray-950 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Lớp học sinh hoạt</label>
              <div className="relative">
                <Bookmark className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="ví dụ: DA21TT"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  maxLength={10}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-gray-950 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Số điện thoại liên lạc</label>
            <input
              type="tel"
              placeholder="ví dụ: 0901234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-950 focus:outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="submit"
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Lưu thông tin
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
