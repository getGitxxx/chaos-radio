import { NextResponse } from 'next/server';
import { verifyKey, generateToken, setAuthCookie } from '../../../lib/auth';

// Simple in-memory rate limiter (resets on cold start in serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many attempts. Try again later.' },
      { status: 429 }
    );
  }
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Invalid content type. Expected application/json' },
        { status: 400 }
      );
    }

    let body: { key?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { key } = body;

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing access key' },
        { status: 400 }
      );
    }

    if (!verifyKey(key)) {
      return NextResponse.json(
        { success: false, error: 'Invalid access key' },
        { status: 401 }
      );
    }

    const token = await generateToken(key);
    const response = NextResponse.json({ success: true });
    response.headers.set('Set-Cookie', setAuthCookie(token));

    return response;
  } catch (error) {
    console.error('Auth Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
