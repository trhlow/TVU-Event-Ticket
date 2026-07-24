import React, { useEffect, useState } from "react";
import PageHeader from "../../components/common/PageHeader";
import DataTable from "../../components/common/DataTable";
import Toast from "../../components/common/Toast";
import { User } from "../../types/user";
import { userService } from "../../services/userService";

export default function SuperAdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setUsers(await userService.listAllRemote());
      } catch (error) {
        setToastMsg(error instanceof Error ? error.message : "Không thể tải danh sách người dùng.");
      }
    })();
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
      header: "Xác minh MSSV",
      accessor: (user: User) => {
        if (user.role !== "SINH_VIEN") return <span className="text-[10px] font-bold text-gray-300">—</span>;
        if (!user.mssv) return <span className="text-[10px] font-bold text-gray-400">Chưa có MSSV</span>;
        return (
          <span className={`text-[10px] font-bold ${user.mssvStatus === "VERIFIED" ? "text-emerald-600" : "text-amber-600"}`}>
            {user.mssvStatus === "VERIFIED" ? "Đã duyệt" : "Chờ duyệt"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 text-left">
      <PageHeader
        breadcrumb={[{ label: "Quản trị hệ thống", path: "/admin" }, { label: "Danh bạ người dùng" }]}
        title="Danh sách người dùng hệ thống"
        description={
          <>
            Tra cứu danh sách người dùng. Thay đổi vai trò tài khoản Ban tổ chức thực hiện qua trang{" "}
            <span className="font-bold text-slate-700">Quản lý Ban tổ chức</span>, không thực hiện trên trang này.
          </>
        }
      />

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <DataTable data={users} columns={columns} searchPlaceholder="Tìm kiếm tên, email, MSSV..." searchField="fullName" />
      </div>

      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg("")} />}
    </div>
  );
}
