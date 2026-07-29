/**
 * Whether a URL is safe to put in an `<img src>`.
 *
 * Banner URLs are free text typed into the event form, so they are attacker-influenced
 * by anyone who can create or edit an event. Only http(s) and same-site absolute paths
 * are allowed through; everything else (javascript:, data:, vbscript:, protocol-relative)
 * is treated as no image at all.
 */
export function isSafeImageUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const trimmed = url.trim();
  if (trimmed === '') {
    return false;
  }

  // "//host/path" inherits the page scheme and silently leaves the site.
  if (trimmed.startsWith('//')) {
    return false;
  }

  // Same-site absolute path.
  if (trimmed.startsWith('/')) {
    return true;
  }

  const colon = trimmed.indexOf(':');
  const slash = trimmed.indexOf('/');
  // No scheme, or the ':' belongs to a path segment rather than a scheme.
  if (colon === -1 || (slash !== -1 && slash < colon)) {
    return false;
  }

  // Browsers ignore whitespace and control characters sitting inside the scheme, so
  // "java\tscript:" is dispatched as "javascript:". Drop every non-letter before
  // comparing, otherwise the check is trivially bypassable.
  const scheme = trimmed.slice(0, colon).replace(/[^a-zA-Z]/g, '').toLowerCase();
  return scheme === 'http' || scheme === 'https';
}
