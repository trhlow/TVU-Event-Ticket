import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmModal from '../../components/common/ConfirmModal';
import Toast from '../../components/common/Toast';
import { User } from '../../types/user';
import { userService } from '../../services/userService';

export default function SuperAdminStudentsPage() {
  const [students, setStudents] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [verifyTarget, setVerifyTarget] = useState<User | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setStudents(await userService.listAllRemote({ role: 'SINH_VIEN' }));
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : 'Không thể tải danh sách sinh viên.');
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleVerify = async () => {
    if (!verifyTarget) return;
    setIsVerifying(true);
    try {
      await userService.verifyMssv(verifyTarget.id);
      setToastMsg(`Đã xác minh MSSV cho ${verifyTarget.fullName}. Sinh viên đăng nhập lại để đặt vé.`);
      setVerifyTarget(null);
      await loadData();
    } catch (error) {
      setToastMsg(error instanceof Error ? error.message : 'Không thể xác minh MSSV.');
    } finally {
      setIsVerifying(false);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const keyword = search.toLowerCase();
      return (
        s.fullName.toLowerCase().includes(keyword) ||
        (s.email && s.email.toLowerCase().includes(keyword)) ||
        (s.mssv && s.mssv.includes(search)) ||
        (s.className && s.className.toLowerCase().includes(keyword))
      );
    });
  }, [students, search]);

  const columns = [
    {
      header: 'Họ và tên / Email',
      accessor: (s: User) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{s.fullName}</span>
          <span className="text-[10px] text-gray-400 block mt-0.5">{s.email}</span>
        </div>
      )
    },
    {
      header: 'MSSV',
      accessor: (s: User) => (
        <span className="text-xs font-bold font-mono text-gray-800">{s.mssv || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Lớp học',
      accessor: (s: User) => (
        <span className="text-xs font-bold text-gray-700">{s.className || 'Chưa cập nhật'}</span>
      )
    },
    {
      header: 'Xác minh MSSV',
      accessor: (s: User) => {
        if (!s.mssv) {
          return (
            <span className="text-[10px] bg-gray-50 text-gray-500 font-extrabold px-2 py-0.5 rounded flex items-center gap-1 w-fit">
              <XCircle className="w-3.5 h-3.5" /> CHƯA CÓ MSSV
            </span>
          );
        }
        return s.mssvStatus === 'VERIFIED' ? (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-2 py-0.5 rounded flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5" /> ĐÃ DUYỆT
          </span>
        ) : (
          <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded flex items-center gap-1 w-fit">
            <Clock className="w-3.5 h-3.5" /> CHỜ DUYỆT
          </span>
        );
      }
    },
    {
      header: 'Trạng Thái',
      accessor: (s: User) => <StatusBadge type="user" status={s.status} />
    },
    {
      header: 'Thao tác',
      accessor: (s: User) => (
        <div className="flex justify-end">
          {s.mssv && s.mssvStatus !== 'VERIFIED' && (
            <button
              onClick={() => setVerifyTarget(s)}
              className="btn-press flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
              title="Xác minh MSSV để sinh viên được phép đặt vé"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Xác minh MSSV
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: 'Quản trị hệ thống', path: '/admin' }, { label: 'Quản lý sinh viên' }]}
        title="Quản lý tài khoản sinh viên"
        description="Tra cứu hồ sơ sinh viên và xác minh MSSV. Sinh viên chỉ được đặt vé sau khi MSSV đã được duyệt."
      />

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 p-4 rounded-2xl shadow-sm">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Tìm kiếm sinh viên</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tên, email, MSSV, lớp..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-md pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden p-1">
          <DataTable
            data={filteredStudents}
            columns={columns}
            searchPlaceholder="Lọc nhanh danh sách..."
            searchField="fullName"
          />
        </div>
      </div>

      {verifyTarget && (
        <ConfirmModal
          isOpen={!!verifyTarget}
          title="Xác minh MSSV sinh viên"
          description={`Xác nhận MSSV "${verifyTarget.mssv}" của "${verifyTarget.fullName}" là hợp lệ? Sau khi duyệt, sinh viên cần đăng nhập lại để được phép đặt vé.`}
          confirmText={isVerifying ? 'Đang xác minh...' : 'Xác minh MSSV'}
          cancelText="Hủy"
          type="info"
          onConfirm={() => void handleVerify()}
          onCancel={() => setVerifyTarget(null)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  );
}
