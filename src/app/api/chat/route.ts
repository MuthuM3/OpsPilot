import { NextRequest } from 'next/server';
import { streamChat } from '@/lib/ai/openai';
import { logToFile } from '@/lib/ai/logger';

export async function POST(request: NextRequest) {
  let body: { messages?: unknown; mode?: 'ask' | 'agent'; chatId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages, mode, chatId } = body;
  logToFile(`[API ROUTE] Received request: mode=${mode}, chatId=${chatId}, messagesCount=${Array.isArray(messages) ? messages.length : 0}`);

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages, mode, chatId)) {
          // Stop generating if the client disconnected / aborted.
          if (request.signal.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        console.error('Chat API stream error:', error);
        try {
          controller.enqueue(
            encoder.encode('\n\n⚠️ Sorry, I encountered an error while generating a response. Please try again.')
          );
        } catch {
          /* client already gone */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
      // Disable proxy buffering so chunks arrive progressively (see Next streaming guide).
      'X-Accel-Buffering': 'no',
    },
  });
}
