import React, { useState } from "react";
import { UserCheck } from "lucide-react";
import { mockUsers } from "../../data/mockUsers";
import DataTable from "../../components/common/DataTable";
import ConfirmModal from "../../components/common/ConfirmModal";
import Toast from "../../components/common/Toast";
import Breadcrumb from "../../components/common/Breadcrumb";
import { User } from "../../types/user";

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const handleRoleEscalation = (user: User) => {
    setTargetUser(user);
  };

  const handleConfirmEscalation = () => {
    if (!targetUser) return;

    const updated = users.map((u) => {
      if (u.id === targetUser.id) {
        const nextRole: User["role"] =
          u.role === "SINH_VIEN" ? "ORGANIZER" : "SINH_VIEN";
        return {
          ...u,
          role: nextRole,
        };
      }
      return u;
    });

    setUsers(updated);
    setToastMsg(
      targetUser.role === "SINH_VIEN"
        ? `Đã nâng quyền tài khoản ${targetUser.fullName} thành Ban Tổ Chức CLB!`
        : `Đã thu hồi quyền Ban Tổ Chức của tài khoản ${targetUser.fullName}.`,
    );
    setTargetUser(null);
  };

  const columns = [
    {
      header: "Tài khoản người dùng",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{user.fullName}</span>
          <span className="text-[10px] text-gray-400 font-bold block mt-0.5">
            {user.email}
          </span>
        </div>
      ),
    },
    {
      header: "MSSV / Lớp",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          {user.mssv ? (
            <>
              <span className="font-mono font-black text-gray-950 block">
                {user.mssv}
              </span>
              <span className="text-[10px] text-gray-400 font-bold font-mono block mt-0.5">
                {user.className}
              </span>
            </>
          ) : (
            <span className="text-gray-400 font-bold text-[10px]">
              Chưa hoàn thiện hồ sơ
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Vai Trò Hệ Thống",
      accessor: (user: User) => (
        <span
          className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide border ${
            user.role === "SUPER_ADMIN"
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : user.role === "ORGANIZER"
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-brand-50 border-brand-200 text-brand-700"
          }`}
        >
          {user.role === "SUPER_ADMIN"
            ? "Super Admin"
            : user.role === "ORGANIZER"
              ? "BTC CLB"
              : "Sinh viên"}
        </span>
      ),
    },
    {
      header: "Xác thực",
      accessor: (user: User) => (
        <span
          className={`text-[10px] font-bold ${user.profileComplete ? "text-emerald-600" : "text-gray-400"}`}
        >
          {user.profileComplete ? "Đã xác thực" : "Chờ hoàn thiện"}
        </span>
      ),
    },
    {
      header: "Phân quyền",
      accessor: (user: User) => (
        <div className="flex gap-1.5 justify-end">
          {user.role !== "SUPER_ADMIN" && (
            <button
              onClick={() => handleRoleEscalation(user)}
              className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-xl text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {user.role === "SINH_VIEN" ? "Cấp quyền BTC" : "Hạ quyền SV"}
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
          { label: "Danh bạ người dùng" },
        ]}
      />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">
          Danh Sách Người Dùng Hệ Thống
        </h2>
        <p className="text-xs text-gray-500 font-semibold">
          Tra cứu danh sách sinh viên trường, điều chỉnh phân quyền quản trị nhanh
          chóng
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <DataTable
          data={users}
          columns={columns}
          searchPlaceholder="Tìm kiếm tên, email, MSSV..."
          searchField="fullName"
        />
      </div>

      {/* Confirmation Modal */}
      {targetUser && (
        <ConfirmModal
          isOpen={!!targetUser}
          title={
            targetUser.role === "SINH_VIEN"
              ? "Nâng Quyền Ban Tổ Chức"
              : "Thu Hồi Quyền Ban Tổ Chức"
          }
          message={
            targetUser.role === "SINH_VIEN"
              ? `Bạn có chắc muốn nâng quyền tài khoản "${targetUser.fullName}" lên Ban Tổ Chức CLB? Họ sẽ có đầy đủ các quyền tạo sự kiện mới, duyệt đơn của sinh viên và kiểm soát cổng check-in.`
              : `Bạn có chắc muốn hạ phân quyền của "${targetUser.fullName}" xuống vai trò Sinh viên bình thường?`
          }
          onConfirm={handleConfirmEscalation}
          onCancel={() => setTargetUser(null)}
          confirmText={
            targetUser.role === "SINH_VIEN" ? "Có, Cấp Quyền" : "Có, Thu Hồi"
          }
          cancelText="Hủy bỏ"
          type={targetUser.role === "SINH_VIEN" ? "success" : "danger"}
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
