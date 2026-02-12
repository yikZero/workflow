import { NextResponse } from 'next/server';
import { readStreamServerAction } from '@/server/workflow-server-actions';

export async function GET(
  request: Request,
  context: { params: Promise<{ streamId: string }> }
) {
  const { streamId } = await context.params;

  // Validate streamId format (alphanumeric with underscores/hyphens)
  if (!streamId || !/^[\w-]+$/.test(streamId)) {
    return NextResponse.json(
      { message: 'Invalid stream ID', layer: 'server' },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const startIndexParam = url.searchParams.get('startIndex');
  const startIndex =
    startIndexParam != null ? Number.parseInt(startIndexParam, 10) : undefined;

  if (startIndex !== undefined && Number.isNaN(startIndex)) {
    return NextResponse.json(
      { message: 'Invalid startIndex parameter', layer: 'server' },
      { status: 400 }
    );
  }

  try {
    const stream = await readStreamServerAction({}, streamId, startIndex);
    if (!stream || !(stream instanceof ReadableStream)) {
      // The server action returned a structured error object.
      return NextResponse.json(stream, { status: 500 });
    }

    return new Response(stream as BodyInit, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ message, layer: 'server' }, { status: 500 });
  }
}
