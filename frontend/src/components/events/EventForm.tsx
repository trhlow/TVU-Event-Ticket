import React, { useState } from 'react';
import { Event } from '../../types/event';
import { Save, Info, FileText, MapPin, Users } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/useToast';

interface EventFormProps {
  initialData?: Event;
  clubId: string;
  clubName: string;
  onSubmit: (data: Partial<Event>) => void | Promise<void>;
  onCancel: () => void;
}

// datetime-local inputs read/write local wall-clock time; toISOString() formats in UTC,
// so converting straight from an ISO instant would shift the displayed value by the UTC offset.
function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="text-[10px] text-danger-600 font-bold">{message}</p>;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="text-xs font-bold text-gray-700 uppercase tracking-wider block">{children}</label>;
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
    bannerUrl: initialData?.bannerUrl || '',
    location: initialData?.location || '',
    startAt: toDatetimeLocalValue(initialData?.startAt),
    endAt: toDatetimeLocalValue(initialData?.endAt),
    registrationOpenAt: toDatetimeLocalValue(initialData?.registrationOpenAt),
    registrationCloseAt: toDatetimeLocalValue(initialData?.registrationCloseAt),
    capacity: initialData?.capacity || 100,
  });

  const isDraft = !initialData || initialData.status === 'DRAFT';
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

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
    } catch {
      showToast('Không thể lưu sự kiện. Vui lòng thử lại.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6 text-left max-w-3xl mx-auto bg-white p-6 rounded-card border border-gray-200 shadow-xs">
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
            <FieldLabel htmlFor="event-title">Tên sự kiện *</FieldLabel>
            <Input
              id="event-title"
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Ví dụ: Hội thảo công nghệ phần mềm CLB Tin học..."
              className={errors.title ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'event-title-error' : undefined}
            />
            <FieldError id="event-title-error" message={errors.title} />
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <FieldLabel htmlFor="event-description">Mô tả chi tiết *</FieldLabel>
            <textarea
              id="event-description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={5}
              placeholder="Nêu rõ mục đích, nội dung chương trình, quyền lợi của sinh viên khi tham gia (ví dụ: điểm rèn luyện)..."
              className={`w-full bg-gray-50/50 border rounded-control px-4 py-3 text-xs font-semibold text-gray-900 focus:outline-none focus:border-brand-500 focus:bg-white ${
                errors.description ? 'border-danger-400 focus:border-danger-500' : 'border-gray-200'
              }`}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'event-description-error' : undefined}
            ></textarea>
            <FieldError id="event-description-error" message={errors.description} />
          </div>
        </div>
      </section>

      {/* Section: Thời gian & địa điểm */}
      <section className="space-y-4 pt-4 border-t border-gray-100">
        <SectionHeading icon={MapPin} title="Thời gian & địa điểm" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-location">Địa điểm tổ chức *</FieldLabel>
            <Input
              id="event-location"
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Ví dụ: Hội trường E24, Đại học Trà Vinh..."
              className={errors.location ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? 'event-location-error' : undefined}
            />
            <FieldError id="event-location-error" message={errors.location} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-bannerUrl">Banner minh họa (URL) — chưa hỗ trợ</FieldLabel>
            <Input
              id="event-bannerUrl"
              type="text"
              name="bannerUrl"
              value={formData.bannerUrl}
              onChange={handleChange}
              placeholder="Tính năng banner hiện chưa được hệ thống lưu lại"
              disabled
              aria-describedby="event-bannerUrl-hint"
            />
            <p id="event-bannerUrl-hint" className="text-[10px] font-semibold text-gray-500">
              Hệ thống chưa lưu trường này — nội dung nhập vào sẽ không được ghi nhận.
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-startAt">Thời gian bắt đầu *</FieldLabel>
            <Input
              id="event-startAt"
              type="datetime-local"
              name="startAt"
              value={formData.startAt}
              onChange={handleChange}
              className={errors.startAt ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.startAt}
              aria-describedby={errors.startAt ? 'event-startAt-error' : undefined}
            />
            <FieldError id="event-startAt-error" message={errors.startAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-endAt">Thời gian kết thúc *</FieldLabel>
            <Input
              id="event-endAt"
              type="datetime-local"
              name="endAt"
              value={formData.endAt}
              onChange={handleChange}
              className={errors.endAt ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.endAt}
              aria-describedby={errors.endAt ? 'event-endAt-error' : undefined}
            />
            <FieldError id="event-endAt-error" message={errors.endAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-registrationOpenAt">Mở đăng ký vé từ ngày *</FieldLabel>
            <Input
              id="event-registrationOpenAt"
              type="datetime-local"
              name="registrationOpenAt"
              value={formData.registrationOpenAt}
              onChange={handleChange}
              className={errors.registrationOpenAt ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.registrationOpenAt}
              aria-describedby={errors.registrationOpenAt ? 'event-registrationOpenAt-error' : undefined}
            />
            <FieldError id="event-registrationOpenAt-error" message={errors.registrationOpenAt} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-registrationCloseAt">Đóng đăng ký vé vào ngày *</FieldLabel>
            <Input
              id="event-registrationCloseAt"
              type="datetime-local"
              name="registrationCloseAt"
              value={formData.registrationCloseAt}
              onChange={handleChange}
              className={errors.registrationCloseAt ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.registrationCloseAt}
              aria-describedby={errors.registrationCloseAt ? 'event-registrationCloseAt-error' : undefined}
            />
            <FieldError id="event-registrationCloseAt-error" message={errors.registrationCloseAt} />
          </div>
        </div>
      </section>

      {/* Section: Sức chứa */}
      <section className="space-y-4 pt-4 border-t border-gray-100">
        <SectionHeading icon={Users} title="Sức chứa" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="event-capacity">
              Số lượng vé phát hành (Sức chứa) * {!isDraft && '— đã khóa'}
            </FieldLabel>
            <Input
              id="event-capacity"
              type="number"
              name="capacity"
              value={formData.capacity}
              onChange={handleChange}
              min={1}
              disabled={!isDraft}
              className={errors.capacity ? 'border-danger-400 focus-visible:border-danger-500' : ''}
              aria-invalid={!!errors.capacity}
              aria-describedby={errors.capacity ? 'event-capacity-error' : 'event-capacity-hint'}
            />
            {!isDraft && (
              <p id="event-capacity-hint" className="text-[10px] font-semibold text-gray-500">
                Sự kiện đã mở đăng ký nên không thể đổi sức chứa nữa.
              </p>
            )}
            <FieldError id="event-capacity-error" message={errors.capacity} />
          </div>
        </div>
      </section>

      <div className="p-4 bg-brand-50/50 border border-brand-100 rounded-card flex gap-3 mt-4 text-left">
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
