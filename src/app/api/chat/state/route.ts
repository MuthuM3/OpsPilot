import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  try {
    const dbState = await prisma.conversationState.findUnique({
      where: { chatId }
    });

    if (dbState) {
      return NextResponse.json({
        activeObjectType: dbState.activeObjectType,
        activeObjectId: dbState.activeObjectId,
        activeWorkflow: dbState.activeWorkflow,
        workflowState: dbState.workflowState,
        metadata: dbState.metadata || {}
      });
    }

    return NextResponse.json({
      activeObjectType: null,
      activeObjectId: null,
      activeWorkflow: null,
      workflowState: null,
      metadata: {}
    });
  } catch (error) {
    console.error('Failed to get chat state:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
