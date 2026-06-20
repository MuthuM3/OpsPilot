import { NextRequest, NextResponse } from 'next/server';
import { processChat } from '@/lib/ai/openai';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, mode } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    const response = await processChat(messages, mode);
    return NextResponse.json({ response });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
