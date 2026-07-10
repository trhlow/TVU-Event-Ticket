import React, { useState } from "react";
import { Edit3, Lock, Plus, Unlock } from "lucide-react";
import { Link } from "react-router-dom";
import { mockClubs } from "../../data/mockClubs";
import DataTable from "../../components/common/DataTable";
import ConfirmModal from "../../components/common/ConfirmModal";
import Toast from "../../components/common/Toast";
import Breadcrumb from "../../components/common/Breadcrumb";
import { Club } from "../../types/club";

export default function SuperAdminClubsPage() {
  const [clubs, setClubs] = useState<Club[]>(mockClubs);
  const [targetClub, setTargetClub] = useState<Club | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const handleToggleStatus = (club: Club) => {
    setTargetClub(club);
  };

  const handleConfirmToggle = () => {
    if (!targetClub) return;

    const updated = clubs.map((c) => {
      if (c.id === targetClub.id) {
        const nextStatus: Club["status"] =
          c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        return {
          ...c,
          status: nextStatus,
        };
      }
      return c;
    });

    setClubs(updated);
    setToastMsg(
      targetClub.status === "ACTIVE"
        ? `Đã khóa tài khoản CLB: ${targetClub.name}`
        : `Đã mở khóa tài khoản CLB: ${targetClub.name}`,
    );
    setTargetClub(null);
  };

  const columns = [
    {
      header: "Mã CLB / Viết tắt",
      accessor: (club: Club) => (
        <span className="font-mono font-black text-gray-950 block">{club.code}</span>
      ),
    },
    {
      header: "Tên Câu Lạc Bộ / Đơn Vị",
      accessor: (club: Club) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{club.name}</span>
          <span className="text-[10px] text-gray-400 font-semibold block mt-1 line-clamp-1 max-w-sm">
            {club.description}
          </span>
        </div>
      ),
    },
    {
      header: "Trưởng CLB (Quản lý)",
      accessor: (club: Club) => (
        <span className="font-bold text-gray-900 block">{club.managerName}</span>
      ),
    },
    {
      header: "Trạng Thái",
      accessor: (club: Club) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
            club.status === "ACTIVE"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {club.status === "ACTIVE" ? "Hoạt động" : "Đã khóa"}
        </span>
      ),
    },
    {
      header: "Phê duyệt",
      accessor: (club: Club) => (
        <div className="flex gap-1.5 justify-end">
          <Link
            to={`/admin/clubs/${club.id}/edit`}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
          >
            <Edit3 className="w-3.5 h-3.5" /> Sửa
          </Link>
          {club.status === "ACTIVE" ? (
            <button
              onClick={() => handleToggleStatus(club)}
              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/60 rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
            >
              <Lock className="w-3.5 h-3.5" /> Khóa CLB
            </button>
          ) : (
            <button
              onClick={() => handleToggleStatus(club)}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
            >
              <Unlock className="w-3.5 h-3.5" /> Kích hoạt
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb
        items={[
          { label: "Quản trị hệ thống", path: "/admin" },
          { label: "Quản lý câu lạc bộ" },
        ]}
      />

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-gray-950 tracking-tight">
            Danh Sách Câu Lạc Bộ Đoàn Trường
          </h2>
          <p className="text-xs text-gray-500 font-semibold">
            Giám sát các đơn vị, khóa tạm thời hoặc kích hoạt tài khoản tổ chức sự kiện
          </p>
        </div>
        <Link
          to="/admin/clubs/create"
          className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" /> Thêm CLB
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <DataTable
          data={clubs}
          columns={columns}
          searchPlaceholder="Tìm kiếm tên câu lạc bộ..."
          searchField="name"
        />
      </div>

      {/* Toggle Status Modal */}
      {targetClub && (
        <ConfirmModal
          isOpen={!!targetClub}
          title={
            targetClub.status === "ACTIVE"
              ? "Xác Nhận Khóa CLB"
              : "Kích Hoạt Tài Khoản CLB"
          }
          message={
            targetClub.status === "ACTIVE"
              ? `Bạn có chắc muốn tạm khóa câu lạc bộ "${targetClub.name}"? Khi bị khóa, ban điều hành CLB sẽ không thể đăng nhập tạo sự kiện hay duyệt vé.`
              : `Kích hoạt lại tài khoản cho câu lạc bộ "${targetClub.name}". Cán bộ quản trị sẽ có thể tiếp tục tổ chức sự kiện Đoàn Hội.`
          }
          onConfirm={handleConfirmToggle}
          onCancel={() => setTargetClub(null)}
          confirmText={
            targetClub.status === "ACTIVE" ? "Có, Tạm Khóa" : "Kích Hoạt Ngay"
          }
          cancelText="Hủy bỏ"
          type={targetClub.status === "ACTIVE" ? "danger" : "success"}
        />
      )}

      {toastMsg && (
        <Toast
          message={toastMsg}
          onClose={() => setToastMsg("")}
        />
      )}
    </div>
  );
}
