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
  // Google may serve a newly changed profile image at the same URL. A stable
  // version parameter prevents a previously cached default avatar lingering.
  const avatarURL = new URL(photoURL);
  avatarURL.searchParams.set('avatar-version', '2');
  image.src = avatarURL.href;
  image.alt = '';
  image.loading = 'eager';
  image.decoding = 'async';
  image.referrerPolicy = 'origin';
  image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
  return image;
}
