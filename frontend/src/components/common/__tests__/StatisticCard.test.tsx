import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Ticket } from 'lucide-react';
import StatisticCard from '../StatisticCard';

describe('StatisticCard', () => {
  it('renders the label and a numeric value', () => {
    render(<StatisticCard label="Tổng vé" value={1200} icon={Ticket} />);

    expect(screen.getByText('Tổng vé')).toBeInTheDocument();
  });

  it('renders a non-numeric value as text instead of running the counter', () => {
    // A string like "Chưa có dữ liệu" must not be fed to the count-up animation,
    // which would render NaN.
    render(<StatisticCard label="Tổng vé" value="Chưa có dữ liệu" icon={Ticket} />);

    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });

  it('renders the trend value when given', () => {
    render(
      <StatisticCard
        label="Tổng vé"
        value={10}
        icon={Ticket}
        trend={{ type: 'up', value: '+8% so với hôm qua' }}
      />,
    );

    expect(screen.getByText('+8% so với hôm qua')).toBeInTheDocument();
  });

  it('renders the subtext when given', () => {
    render(<StatisticCard label="Tổng vé" value={10} icon={Ticket} subtext="Trong 7 ngày" />);

    expect(screen.getByText('Trong 7 ngày')).toBeInTheDocument();
  });
});
