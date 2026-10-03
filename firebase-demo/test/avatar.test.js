import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSafeAvatarURL } from '../avatar.js';

test('only accepts HTTPS photo URLs for ranking avatars', () => {
  assert.equal(isSafeAvatarURL('https://example.com/avatar.jpg'), true);
  assert.equal(isSafeAvatarURL('http://example.com/avatar.jpg'), false);
  assert.equal(isSafeAvatarURL('javascript:alert(1)'), false);
  assert.equal(isSafeAvatarURL('not a URL'), false);
  assert.equal(isSafeAvatarURL(''), false);
  assert.equal(isSafeAvatarURL(null), false);
});
