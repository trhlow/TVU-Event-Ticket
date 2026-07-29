import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EventBanner from '../EventBanner';

describe('EventBanner', () => {
  it('renders the image for an https banner URL', () => {
    render(<EventBanner src="https://images.example.com/banner.jpg" alt="Hội thảo AI" />);

    expect(screen.getByRole('img', { name: 'Hội thảo AI' })).toHaveAttribute(
      'src',
      'https://images.example.com/banner.jpg',
    );
  });

  it('renders the placeholder instead of an image for a javascript: banner URL', () => {
    // The banner URL is free text on the event form, so an organiser can type any
    // scheme. Nothing but http(s) may reach the src attribute.
    render(<EventBanner src="javascript:alert(1)" alt="Hội thảo AI" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Hội thảo AI')).toBeInTheDocument();
  });

  it('renders the placeholder when no banner URL is given', () => {
    render(<EventBanner alt="Hội thảo AI" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Hội thảo AI')).toBeInTheDocument();
  });
});
