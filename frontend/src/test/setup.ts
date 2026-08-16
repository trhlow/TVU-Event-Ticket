import '@testing-library/jest-dom/vitest';

// jsdom ships no window.matchMedia. Any component that reaches for a media query
// during an effect -- useCardTilt checks prefers-reduced-motion and pointer
// coarseness before enabling the tilt -- throws on mount without this stub.
// Reporting `matches: false` puts tests on the fine-pointer, motion-allowed path,
// which is the branch the interactive behaviour actually lives in.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
