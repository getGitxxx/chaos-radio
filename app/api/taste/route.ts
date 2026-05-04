import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const tastePath = join(process.cwd(), 'user/taste.md');
    const content = await readFile(tastePath, 'utf-8');

    return NextResponse.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    console.error('[Taste] Error reading taste file:', error);
    return NextResponse.json({
      success: false,
      data: { content: '' },
      error: 'Failed to read taste configuration',
    });
  }
}
