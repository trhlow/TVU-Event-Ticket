import { describe, expect, it } from 'vitest';
import { isSafeImageUrl } from '../safeImageUrl';

// The banner URL is free text typed by an organiser (EventForm "Banner minh hoạ (URL)"),
// so it reaches an <img src> attribute unvalidated. Only http(s) and same-site paths
// may get there.
describe('isSafeImageUrl', () => {
  it('accepts an absolute https URL', () => {
    expect(isSafeImageUrl('https://images.example.com/banner.jpg?w=800')).toBe(true);
  });

  it('accepts an absolute http URL', () => {
    expect(isSafeImageUrl('http://images.example.com/banner.jpg')).toBe(true);
  });

  it('accepts a site-relative path', () => {
    expect(isSafeImageUrl('/assets/banner.jpg')).toBe(true);
  });

  it('rejects a javascript: URL', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects a javascript: URL padded with leading whitespace', () => {
    expect(isSafeImageUrl('   javascript:alert(1)')).toBe(false);
  });

  it('rejects a javascript: URL broken up by a control character', () => {
    // Browsers strip TAB/CR/LF inside the scheme before dispatching the URL,
    // so a naive startsWith('javascript:') check would miss this.
    expect(isSafeImageUrl('java\tscript:alert(1)')).toBe(false);
  });

  it('rejects a javascript: URL in mixed case', () => {
    expect(isSafeImageUrl('JaVaScRiPt:alert(1)')).toBe(false);
  });

  it('rejects a data:text/html URL', () => {
    expect(isSafeImageUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
  });

  it('rejects a vbscript: URL', () => {
    expect(isSafeImageUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects a protocol-relative URL', () => {
    // "//evil.example" inherits the page scheme and leaves the site silently.
    expect(isSafeImageUrl('//evil.example/banner.jpg')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isSafeImageUrl(undefined)).toBe(false);
  });

  it('rejects an empty or blank string', () => {
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl('   ')).toBe(false);
  });
});
