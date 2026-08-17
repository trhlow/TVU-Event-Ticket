import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Compass } from 'lucide-react';
import StatusPage from '../StatusPage';

describe('StatusPage', () => {
  it('renders the code, title and description', () => {
    render(
      <StatusPage
        code="Lỗi 404"
        title="Không tìm thấy trang"
        description="Đường dẫn hiện tại không tồn tại."
        icon={Compass}
      />,
    );

    expect(screen.getByText('Lỗi 404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.getByText('Đường dẫn hiện tại không tồn tại.')).toBeInTheDocument();
  });

  it('renders the action slot', () => {
    render(
      <StatusPage
        code="Lỗi 403"
        title="Quyền truy cập bị hạn chế"
        description="Bạn không có đủ phân quyền."
        icon={Compass}
        tone="danger"
        action={<a href="/">Về trang chủ</a>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('supports a warning tone', () => {
    // The 500 page is amber, not red. Without a warning tone it would have to
    // reuse `danger` and silently change colour when moving onto this component.
    render(
      <StatusPage
        code="Lỗi 500"
        title="Lỗi máy chủ hệ thống"
        description="Đã xảy ra sự cố."
        icon={Compass}
        tone="warning"
      />,
    );

    expect(screen.getByText('Lỗi 500')).toHaveClass('text-warning-600');
  });
});
