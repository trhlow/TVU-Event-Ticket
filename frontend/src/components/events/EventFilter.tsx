import React from 'react';
import { Search, Filter, RefreshCw } from 'lucide-react';

interface EventFilterProps {
  clubs: Array<{ id: string; name: string }>;
  categories: string[];
  onSearchChange: (text: string) => void;
  onClubChange: (clubId: string) => void;
  onCategoryChange: (category: string) => void;
  onStatusChange: (status: string) => void;
  onReset: () => void;
  selectedClubId: string;
  selectedCategory: string;
  selectedStatus: string;
  searchValue: string;
}

export default function EventFilter({
  clubs,
  categories,
  onSearchChange,
  onClubChange,
  onCategoryChange,
  onStatusChange,
  onReset,
  selectedClubId,
  selectedCategory,
  selectedStatus,
  searchValue,
}: EventFilterProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4 text-left">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-600" />
          <h4 className="text-xs font-black uppercase tracking-wider text-gray-700">Bộ Lọc Sự Kiện</h4>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-brand-600 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Thiết lập lại
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Search Input */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Từ khóa tìm kiếm</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Nhập tên sự kiện..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Club Select */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Đơn vị tổ chức (CLB)</label>
          <select
            value={selectedClubId}
            onChange={(e) => onClubChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-brand-500 focus:bg-white cursor-pointer"
          >
            <option value="ALL">Tất cả CLB</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </div>

        {/* Category Select */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Thể loại sự kiện</label>
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-brand-500 focus:bg-white cursor-pointer"
          >
            <option value="ALL">Tất cả thể loại</option>
            {categories.map((cat, idx) => (
              <option key={idx} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Status Select */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Trạng thái đăng ký</label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 focus:outline-none focus:border-brand-500 focus:bg-white cursor-pointer"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="OPEN">Đang mở đăng ký</option>
            <option value="UPCOMING">Sắp mở</option>
            <option value="CLOSED">Đã đóng</option>
            <option value="FULL">Hết vé</option>
            <option value="ENDED">Đã kết thúc</option>
          </select>
        </div>
      </div>
    </div>
  );
}
