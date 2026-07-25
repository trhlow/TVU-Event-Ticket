import React, { useState } from 'react';
import { Event } from '../../types/event';
import { Save, Info, FileText, MapPin, Users } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface EventFormProps {
  initialData?: Event;
  clubId: string;
  clubName: string;
  onSubmit: (data: Partial<Event>) => void | Promise<void>;
  onCancel: () => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[10px] text-rose-600 font-bold">{message}</p>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">{children}</label>;
}

function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <Icon className="w-4 h-4 text-brand-600" />
      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">{title}</h4>
    </div>
  );
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        clubId,
        clubName,
        remainingTickets: initialData ? initialData.remainingTickets : formData.capacity,
      });
    } finally {
      setIsSubmitting(false);
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

      {/* Section: Thông tin cơ bản */}
      <section className="space-y-4">
        <SectionHeading icon={FileText} title="Thông tin cơ bản" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-1.5">
            <FieldLabel>Tên sự kiện *</FieldLabel>
            <Input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Ví dụ: Hội thảo công nghệ phần mềm CLB Tin học..."
              className={errors.title ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.title} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Thể loại sự kiện</FieldLabel>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="tvu-input cursor-pointer"
            >
              <option value="Học thuật">Học thuật</option>
              <option value="Văn nghệ">Văn nghệ</option>
              <option value="Cuộc thi">Cuộc thi</option>
              <option value="Tình nguyện">Tình nguyện</option>
              <option value="Kỹ năng">Kỹ năng</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Trạng thái phát hành</FieldLabel>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="tvu-input cursor-pointer"
            >
              <option value="UPCOMING">Sắp mở đăng ký (Ẩn)</option>
              <option value="OPEN">Mở đăng ký ngay (Công khai)</option>
              <option value="CLOSED">Đóng đăng ký</option>
              <option value="ENDED">Kết thúc sự kiện</option>
            </select>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <FieldLabel>Mô tả chi tiết *</FieldLabel>
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
            <FieldError message={errors.description} />
          </div>
        </div>
      </section>

      {/* Section: Thời gian & địa điểm */}
      <section className="space-y-4 pt-4 border-t border-gray-100">
        <SectionHeading icon={MapPin} title="Thời gian & địa điểm" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <FieldLabel>Địa điểm tổ chức *</FieldLabel>
            <Input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Ví dụ: Hội trường E24, Đại học Trà Vinh..."
              className={errors.location ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.location} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Banner minh họa (URL)</FieldLabel>
            <Input
              type="text"
              name="bannerUrl"
              value={formData.bannerUrl}
              onChange={handleChange}
              placeholder="Nhập liên kết ảnh banner..."
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Thời gian bắt đầu *</FieldLabel>
            <Input
              type="datetime-local"
              name="startAt"
              value={formData.startAt}
              onChange={handleChange}
              className={errors.startAt ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.startAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Thời gian kết thúc *</FieldLabel>
            <Input
              type="datetime-local"
              name="endAt"
              value={formData.endAt}
              onChange={handleChange}
              className={errors.endAt ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.endAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Mở đăng ký vé từ ngày *</FieldLabel>
            <Input
              type="datetime-local"
              name="registrationOpenAt"
              value={formData.registrationOpenAt}
              onChange={handleChange}
              className={errors.registrationOpenAt ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.registrationOpenAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Đóng đăng ký vé vào ngày *</FieldLabel>
            <Input
              type="datetime-local"
              name="registrationCloseAt"
              value={formData.registrationCloseAt}
              onChange={handleChange}
              className={errors.registrationCloseAt ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.registrationCloseAt} />
          </div>
        </div>
      </section>

      {/* Section: Sức chứa */}
      <section className="space-y-4 pt-4 border-t border-gray-100">
        <SectionHeading icon={Users} title="Sức chứa" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <FieldLabel>Số lượng vé phát hành (Sức chứa) *</FieldLabel>
            <Input
              type="number"
              name="capacity"
              value={formData.capacity}
              onChange={handleChange}
              min={1}
              className={errors.capacity ? 'border-rose-400 focus-visible:border-rose-500' : ''}
            />
            <FieldError message={errors.capacity} />
          </div>
        </div>
      </section>

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
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Hủy bỏ
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? "Đang lưu..." : "Lưu sự kiện"}
        </Button>
      </div>
    </form>
  );
}
