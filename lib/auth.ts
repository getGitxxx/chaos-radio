import { cookies } from 'next/headers';

const TOKEN_COOKIE = 'chaos-radio-token';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// 使用 Edge Runtime 支持的 Web Crypto API
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function verifyKey(key: string): boolean {
  const accessKey = process.env.ACCESS_KEY;
  if (!accessKey) return false;
  return timingSafeEquals(key, accessKey);
}

export async function generateToken(key: string): Promise<string> {
  return await hashKey(key + ':chaos-radio-salt');
}

export async function getExpectedToken(): Promise<string> {
  const accessKey = process.env.ACCESS_KEY;
  if (!accessKey) return '';
  return await generateToken(accessKey);
}

export async function verifyRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  if (!token) return false;
  const expected = await getExpectedToken();
  return timingSafeEquals(token, expected);
}

export function setAuthCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}${secure}`;
}

export function clearAuthCookie(): string {
  return `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
