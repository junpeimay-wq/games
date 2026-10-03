export function isSafeAvatarURL(value) {
  if (typeof value !== 'string' || value.length === 0) return false;

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createAvatarElement(photoURL, className = 'rank-avatar') {
  const fallback = document.createElement('span');
  fallback.className = `${className} rank-avatar-fallback`;
  fallback.textContent = '👤';
  fallback.setAttribute('aria-hidden', 'true');

  if (!isSafeAvatarURL(photoURL)) return fallback;

  const image = document.createElement('img');
  image.className = className;
  image.src = photoURL;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
  return image;
}
