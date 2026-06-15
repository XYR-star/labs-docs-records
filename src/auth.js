import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export function signSession(secret) {
  const payload = JSON.stringify({
    sub: 'admin',
    iat: Date.now()
  });
  const body = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

export function verifySession(token, secret) {
  if (!token || !token.includes('.')) return false;
  const [body, signature] = token.split('.');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function verifyPassword(password, hash) {
  if (!hash || !password) return false;
  return bcrypt.compare(password, hash);
}
