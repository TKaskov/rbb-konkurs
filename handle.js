// Instagram nickname helpers — shared by the page (window.RBBHandle) and tests (require).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RBBHandle = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const HANDLE_PATTERN = /^[a-z0-9._]{1,30}$/;
  const PROFILE_LINK_PATTERN = /instagram\.com\/([^/?#\s]+)/;

  function normalizeHandle(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim().toLowerCase();
    const fromLink = trimmed.match(PROFILE_LINK_PATTERN);
    const candidate = fromLink ? fromLink[1] : trimmed;
    return candidate.replace(/^@+/, '').replace(/\/+$/, '');
  }

  function isValidHandle(handle) {
    return (
      typeof handle === 'string' &&
      HANDLE_PATTERN.test(handle) &&
      !handle.startsWith('.') &&
      !handle.endsWith('.') &&
      !handle.includes('..')
    );
  }

  function instagramUrl(handle) {
    return 'https://www.instagram.com/' + encodeURIComponent(handle) + '/';
  }

  return Object.freeze({ normalizeHandle, isValidHandle, instagramUrl });
});
