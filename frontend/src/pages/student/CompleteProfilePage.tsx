import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Save, User, Info } from 'lucide-react';
import { getCurrentUser, setCurrentUser } from '../../data/mockAuth';
import Toast from '../../components/common/Toast';
import Breadcrumb from '../../components/common/Breadcrumb';

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const [mssv, setMssv] = useState(currentUser.mssv || '');
  const [className, setClassName] = useState(currentUser.className || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mssv.trim()) {
      setErrorMsg('Vui lòng nhập Mã số sinh viên (MSSV).');
      return;
    }
    if (!className.trim()) {
      setErrorMsg('Vui lòng nhập tên lớp học (ví dụ: DA21TT).');
      return;
    }

    // Save and update profile complete status
    const updatedUser = {
      ...currentUser,
      mssv: mssv.trim(),
      className: className.trim().toUpperCase(),
      profileComplete: true,
    };

    setCurrentUser(updatedUser);
    setToastMsg('Cập nhật hồ sơ sinh viên thành công!');
    setErrorMsg('');

    setTimeout(() => {
      navigate('/student');
      window.location.reload();
    }, 1200);
  };

  return (
    <div className="space-y-6 text-left max-w-2xl mx-auto">
      <Breadcrumb items={[{ label: 'Sinh viên', path: '/student' }, { label: 'Hoàn tất hồ sơ' }]} />

      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-950 tracking-tight">Hoàn Thiện Hồ Sơ Đăng Ký Vé</h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">Cung cấp thông tin xác thực định danh trước khi đăng ký sự kiện Đoàn Hội</p>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] font-bold text-rose-800 flex gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

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
            <p className="text-[10px] text-gray-400 font-semibold">Tên sinh viên đồng bộ tự động qua cổng SSO Microsoft của trường.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mã số sinh viên (MSSV) *</label>
              <input
                type="text"
                placeholder="ví dụ: 110121001"
                value={mssv}
                onChange={(e) => setMssv(e.target.value)}
                maxLength={12}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-950 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Lớp học sinh hoạt *</label>
              <input
                type="text"
                placeholder="ví dụ: DA21TT"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                maxLength={10}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-950 focus:outline-none focus:border-brand-500 focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="p-4 bg-brand-50/50 border border-brand-100 rounded-xl flex gap-3 text-left">
            <Info className="w-5 h-5 text-brand-600 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-extrabold text-brand-900 leading-none">Chính sách minh bạch thông tin</p>
              <p className="text-[10px] text-brand-800 leading-relaxed font-semibold">
                Thông tin MSSV và Lớp học sẽ được in trực tiếp trên mã QR vé điện tử và danh sách tham dự để hỗ trợ Ban tổ chức CLB điểm danh rà soát điểm rèn luyện chính xác. Vui lòng khai báo đúng thực tế.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => navigate('/student')}
              className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Quay lại
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Cập nhật hồ sơ
            </button>
          </div>
        </form>
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
