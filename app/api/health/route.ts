import { NextResponse } from 'next/server';

const startTime = Date.now();

/**
 * Health check endpoint for monitoring and deployment verification.
 * GET /api/health → { status: "ok", uptime: number, timestamp: string }
 */
export async function GET() {
  const uptimeMs = Date.now() - startTime;

  // Check required env vars
  const missingEnvVars: string[] = [];
  if (!process.env.ACCESS_KEY) missingEnvVars.push('ACCESS_KEY');
  if (!process.env.DEEPSEEK_API_KEY) missingEnvVars.push('DEEPSEEK_API_KEY');
  if (!process.env.EDGE_TTS_URL) missingEnvVars.push('EDGE_TTS_URL');

  return NextResponse.json({
    status: missingEnvVars.length > 0 ? 'degraded' : 'ok',
    uptime: Math.round(uptimeMs / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    env: {
      missing: missingEnvVars,
    },
  });
}
