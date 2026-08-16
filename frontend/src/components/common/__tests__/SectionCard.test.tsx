import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SectionCard from '../SectionCard';

describe('SectionCard', () => {
  it('renders the title as a heading so screen readers get the section structure', () => {
    render(
      <SectionCard title="Sự kiện sắp diễn ra">
        <p>Nội dung</p>
      </SectionCard>,
    );

    expect(screen.getByRole('heading', { name: 'Sự kiện sắp diễn ra' })).toBeInTheDocument();
    expect(screen.getByText('Nội dung')).toBeInTheDocument();
  });

  it('renders the action slot beside the title', () => {
    render(
      <SectionCard title="Vé của tôi" action={<button type="button">Xuất file</button>}>
        <p>Nội dung</p>
      </SectionCard>,
    );

    expect(screen.getByRole('button', { name: 'Xuất file' })).toBeInTheDocument();
  });

  it('omits the description paragraph when no description is given', () => {
    const { container } = render(
      <SectionCard title="Thống kê">
        <p>Nội dung</p>
      </SectionCard>,
    );

    // A stray empty <p> under the heading would add dead vertical space to every
    // card in the app that does not pass a description.
    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
