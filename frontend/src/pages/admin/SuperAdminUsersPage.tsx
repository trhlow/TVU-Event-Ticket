import React, { useEffect, useState } from "react";
import Breadcrumb from "../../components/common/Breadcrumb";
import DataTable from "../../components/common/DataTable";
import BackendPendingNotice from "../../components/common/BackendPendingNotice";
import DemoDataBadge from "../../components/common/DemoDataBadge";
import { User } from "../../types/user";
import { userService } from "../../services/userService";

const REQUIRED_ENDPOINTS = ["GET /admin/users", "PATCH /admin/users/{id}/role"];

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    try {
      setUsers(userService.list());
    } catch {
      setUsers(null);
    }
  }, []);

  const columns = [
    {
      header: "Tài khoản người dùng",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          <span className="font-bold text-gray-950 block">{user.fullName}</span>
          <span className="text-[10px] text-gray-400 font-bold block mt-0.5">{user.email}</span>
        </div>
      ),
    },
    {
      header: "MSSV / Lớp",
      accessor: (user: User) => (
        <div className="text-left font-semibold">
          {user.mssv ? (
            <>
              <span className="font-mono font-black text-gray-950 block">{user.mssv}</span>
              <span className="text-[10px] text-gray-400 font-bold font-mono block mt-0.5">{user.className}</span>
            </>
          ) : (
            <span className="text-gray-400 font-bold text-[10px]">Chưa hoàn thiện hồ sơ</span>
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
          {user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ORGANIZER" ? "BTC CLB" : "Sinh viên"}
        </span>
      ),
    },
    {
      header: "Xác thực",
      accessor: (user: User) => (
        <span className={`text-[10px] font-bold ${user.profileComplete ? "text-emerald-600" : "text-gray-400"}`}>
          {user.profileComplete ? "Đã xác thực" : "Chờ hoàn thiện"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <Breadcrumb items={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Danh bạ người dùng" }]} />

      <div className="space-y-1">
        <h2 className="text-xl font-black text-gray-950 tracking-tight">Danh Sách Người Dùng Hệ Thống</h2>
        <p className="text-xs text-gray-500 font-semibold">
          Tra cứu danh sách người dùng. Thay đổi vai trò tài khoản Ban tổ chức thực hiện qua trang{" "}
          <span className="font-bold text-gray-700">Quản lý Ban tổ chức</span>, không thực hiện trên trang này.
        </p>
      </div>

      {users === null ? (
        <BackendPendingNotice
          description="Backend chưa có API liệt kê toàn bộ người dùng hệ thống hoặc đổi vai trò tài khoản. Trang này sẽ hiển thị dữ liệu thật ngay khi API sẵn sàng."
          requiredEndpoints={REQUIRED_ENDPOINTS}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <DemoDataBadge />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <DataTable data={users} columns={columns} searchPlaceholder="Tìm kiếm tên, email, MSSV..." searchField="fullName" />
          </div>
        </div>
      )}
    </div>
  );
}
