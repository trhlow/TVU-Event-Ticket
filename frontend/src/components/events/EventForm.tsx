import React, { useState } from 'react';
import { Event } from '../../types/event';
import { Save, Info } from 'lucide-react';

interface EventFormProps {
  initialData?: Event;
  clubId: string;
  clubName: string;
  onSubmit: (data: Partial<Event>) => void;
  onCancel: () => void;
}

export default function EventForm({
  initialData,
  clubId,
  clubName,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [formData, setFormData] = useState<Partial<Event>>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    category: initialData?.category || 'Học thuật',
    bannerUrl: initialData?.bannerUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
    location: initialData?.location || '',
    startAt: initialData?.startAt ? new Date(initialData.startAt).toISOString().slice(0, 16) : '',
    endAt: initialData?.endAt ? new Date(initialData.endAt).toISOString().slice(0, 16) : '',
    registrationOpenAt: initialData?.registrationOpenAt ? new Date(initialData.registrationOpenAt).toISOString().slice(0, 16) : '',
    registrationCloseAt: initialData?.registrationCloseAt ? new Date(initialData.registrationCloseAt).toISOString().slice(0, 16) : '',
    capacity: initialData?.capacity || 100,
    status: initialData?.status || 'UPCOMING',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title?.trim()) newErrors.title = 'Tên sự kiện không được để trống';
    if (!formData.description?.trim()) newErrors.description = 'Mô tả sự kiện không được để trống';
    if (!formData.location?.trim()) newErrors.location = 'Địa điểm không được để trống';
    if (!formData.startAt) newErrors.startAt = 'Thời gian bắt đầu không hợp lệ';
    if (!formData.endAt) newErrors.endAt = 'Thời gian kết thúc không hợp lệ';
    if (formData.startAt && formData.endAt && new Date(formData.startAt) >= new Date(formData.endAt)) {
      newErrors.endAt = 'Thời gian kết thúc phải sau thời gian bắt đầu';
    }
    if (!formData.registrationOpenAt) newErrors.registrationOpenAt = 'Thời gian mở đăng ký không hợp lệ';
    if (!formData.registrationCloseAt) newErrors.registrationCloseAt = 'Thời gian đóng đăng ký không hợp lệ';
    if (formData.registrationOpenAt && formData.registrationCloseAt && new Date(formData.registrationOpenAt) >= new Date(formData.registrationCloseAt)) {
      newErrors.registrationCloseAt = 'Thời gian đóng đăng ký phải sau thời gian mở đăng ký';
    }
    if (formData.registrationCloseAt && formData.startAt && new Date(formData.registrationCloseAt) >= new Date(formData.startAt)) {
      newErrors.registrationCloseAt = 'Thời gian đóng đăng ký phải trước thời gian diễn ra sự kiện';
    }
    if (!formData.capacity || formData.capacity <= 0) newErrors.capacity = 'Sức chứa phải lớn hơn 0';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'capacity' ? parseInt(value) || 0 : value,
    }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit({
        ...formData,
        clubId,
        clubName,
        remainingTickets: initialData ? initialData.remainingTickets : formData.capacity,
      });
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6 text-left max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-gray-200 shadow-xs">
      <div className="flex justify-between items-center pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-base font-bold text-gray-950 tracking-tight">
            {initialData ? 'Chỉnh Sửa Sự Kiện' : 'Tạo Sự Kiện Mới'}
          </h3>
          <p className="text-[11px] text-gray-500 font-semibold mt-1">
            Đơn vị tổ chức: <span className="text-brand-600">{clubName}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Title */}
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Tên sự kiện *</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Ví dụ: Hội thảo công nghệ phần mềm CLB Tin học..."
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.title ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.title && <p className="text-[10px] text-rose-600 font-bold">{errors.title}</p>}
        </div>

        {/* Category & Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Thể loại sự kiện</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 focus:outline-none focus:border-brand-500 focus:bg-white cursor-pointer"
          >
            <option value="Học thuật">Học thuật</option>
            <option value="Văn nghệ">Văn nghệ</option>
            <option value="Cuộc thi">Cuộc thi</option>
            <option value="Tình nguyện">Tình nguyện</option>
            <option value="Kỹ năng">Kỹ năng</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Trạng thái phát hành</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-700 focus:outline-none focus:border-brand-500 focus:bg-white cursor-pointer"
          >
            <option value="UPCOMING">Sắp mở đăng ký (Ẩn)</option>
            <option value="OPEN">Mở đăng ký ngay (Công khai)</option>
            <option value="CLOSED">Đóng đăng ký</option>
            <option value="ENDED">Kết thúc sự kiện</option>
          </select>
        </div>

        {/* Description */}
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mô tả chi tiết *</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={5}
            placeholder="Nêu rõ mục đích, nội dung chương trình, quyền lợi của sinh viên khi tham gia (ví dụ: điểm rèn luyện)..."
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-3 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.description ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          ></textarea>
          {errors.description && <p className="text-[10px] text-rose-600 font-bold">{errors.description}</p>}
        </div>

        {/* Location & Banner URL */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Địa điểm tổ chức *</label>
          <input
            type="text"
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="Ví dụ: Hội trường E24, Đại học Trà Vinh..."
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.location ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.location && <p className="text-[10px] text-rose-600 font-bold">{errors.location}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Banner minh họa (URL URL)</label>
          <input
            type="text"
            name="bannerUrl"
            value={formData.bannerUrl}
            onChange={handleChange}
            placeholder="Nhập liên kết ảnh banner..."
            className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white"
          />
        </div>

        {/* Time settings */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Thời gian bắt đầu *</label>
          <input
            type="datetime-local"
            name="startAt"
            value={formData.startAt}
            onChange={handleChange}
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.startAt ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.startAt && <p className="text-[10px] text-rose-600 font-bold">{errors.startAt}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Thời gian kết thúc *</label>
          <input
            type="datetime-local"
            name="endAt"
            value={formData.endAt}
            onChange={handleChange}
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.endAt ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.endAt && <p className="text-[10px] text-rose-600 font-bold">{errors.endAt}</p>}
        </div>

        {/* Registration range */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mở đăng ký vé từ ngày *</label>
          <input
            type="datetime-local"
            name="registrationOpenAt"
            value={formData.registrationOpenAt}
            onChange={handleChange}
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.registrationOpenAt ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.registrationOpenAt && <p className="text-[10px] text-rose-600 font-bold">{errors.registrationOpenAt}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Đóng đăng ký vé vào ngày *</label>
          <input
            type="datetime-local"
            name="registrationCloseAt"
            value={formData.registrationCloseAt}
            onChange={handleChange}
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.registrationCloseAt ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.registrationCloseAt && <p className="text-[10px] text-rose-600 font-bold">{errors.registrationCloseAt}</p>}
        </div>

        {/* Capacity */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Số lượng vé phát hành (Sức chứa) *</label>
          <input
            type="number"
            name="capacity"
            value={formData.capacity}
            onChange={handleChange}
            min={1}
            className={`w-full bg-gray-50/50 border rounded-xl px-4 py-2.5 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
              errors.capacity ? 'border-rose-400 focus:border-rose-500' : 'border-gray-200'
            }`}
          />
          {errors.capacity && <p className="text-[10px] text-rose-600 font-bold">{errors.capacity}</p>}
        </div>
      </div>

      <div className="p-4 bg-brand-50/50 border border-brand-100 rounded-xl flex gap-3 mt-4 text-left">
        <Info className="w-5 h-5 text-brand-600 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-extrabold text-brand-900">Quy trình cấp phát vé</p>
          <p className="text-[10px] text-brand-800 leading-relaxed font-semibold">
            Đăng ký của sinh viên ban đầu sẽ được đưa vào hàng đợi phê duyệt (Trạng thái: Chờ duyệt). 
            Khi bạn duyệt đăng ký thành công, hệ thống mới chính thức trừ vào số lượng vé còn lại và tự động gửi mã QR vé hợp lệ tới tài khoản sinh viên.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
        >
          Hủy bỏ
        </button>
        <button
          type="submit"
          className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          Lưu sự kiện
        </button>
      </div>
    </form>
  );
}
