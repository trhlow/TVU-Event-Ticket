import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import QRDisplayCard from '../QRDisplayCard';
import { Ticket } from '../../../types/ticket';
import { Event } from '../../../types/event';

// The payload the check-in scanner reads. Rendered as a real QR, never as the bare ticket id --
// which is what this card showed before the fallback endpoint existed, and which never scanned:
// the verifier wants four colon-separated parts and a signature.
const PAYLOAD = 'a1b2c3d4-0000-0000-0000-000000000001:e5f6:1790000000:deadbeef';

const event: Event = {
  id: 'e1',
  clubId: 'c1',
  clubName: 'CLB Tin học',
  title: 'Workshop React',
  description: '',
  bannerUrl: '',
  location: 'Hội trường A',
  startAt: '2026-09-01T08:00:00Z',
  endAt: '2026-09-01T11:00:00Z',
  registrationOpenAt: '2026-08-01T00:00:00Z',
  registrationCloseAt: '2026-08-30T00:00:00Z',
  capacity: 100,
  remainingTickets: 10,
  status: 'OPEN',
};

const ticket: Ticket = {
  id: 't1',
  eventId: 'e1',
  studentId: 'sv1',
  ticketCode: 't1',
  status: 'VALID',
  checkInStatus: 'PENDING',
  issuedAt: '2026-08-10T00:00:00Z',
};

describe('QRDisplayCard', () => {
  it('draws the signed payload as a QR code once it has been fetched', () => {
    const { container } = render(
      <QRDisplayCard ticket={{ ...ticket, qrCodeValue: PAYLOAD }} event={event} />,
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
    // The old "chưa hỗ trợ hiển thị lại mã QR" copy must be gone: it told students the feature did
    // not exist, and a student who believes that does not come here when their email is missing.
    expect(screen.queryByText(/chưa hỗ trợ/i)).not.toBeInTheDocument();
  });

  it('says it is working while the payload is still being fetched', () => {
    render(<QRDisplayCard ticket={ticket} event={event} isQrLoading />);

    // Distinct from the failure message. An empty box that looks identical either way leaves the
    // student unsure whether to keep waiting.
    expect(screen.getByRole('status')).toHaveTextContent(/Đang tạo lại mã QR/);
  });

  it('points the student back to their email when the code could not be re-issued', () => {
    render(<QRDisplayCard ticket={ticket} event={event} isQrLoading={false} />);

    expect(screen.getByText(/Không tải lại được mã QR/i)).toBeInTheDocument();
    expect(screen.getByText(/kiểm tra hộp thư/i)).toBeInTheDocument();
  });

  it('still shows a finished event’s code, labelled as no longer usable', () => {
    render(
      <QRDisplayCard
        ticket={{ ...ticket, qrCodeValue: PAYLOAD }}
        event={event}
        qrExpiresAt="2020-01-01T00:00:00Z"
      />,
    );

    // Shown rather than hidden: a student looking at a past ticket is looking at their own history,
    // and an empty box there reads as a bug. The label is what stops them queuing at a door.
    expect(screen.getByText(/Sự kiện đã kết thúc/)).toBeInTheDocument();
  });

  it('does not label a code that is still valid', () => {
    render(
      <QRDisplayCard
        ticket={{ ...ticket, qrCodeValue: PAYLOAD }}
        event={event}
        qrExpiresAt="2099-01-01T00:00:00Z"
      />,
    );

    expect(screen.queryByText(/Sự kiện đã kết thúc/)).not.toBeInTheDocument();
  });
});
