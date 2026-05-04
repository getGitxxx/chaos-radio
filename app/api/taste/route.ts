import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
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

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { content } = body;

    if (typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Content must be a string' },
        { status: 400 }
      );
    }

    if (content.length > 4096) {
      return NextResponse.json(
        { success: false, error: 'Content too long (max 4096 chars)' },
        { status: 400 }
      );
    }

    const tastePath = join(process.cwd(), 'user/taste.md');
    await writeFile(tastePath, content, 'utf-8');

    console.log('[Taste] Taste configuration updated');
    return NextResponse.json({ success: true, message: 'Taste updated' });
  } catch (error) {
    console.error('[Taste] Error writing taste file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update taste configuration' },
      { status: 500 }
    );
  }
}
