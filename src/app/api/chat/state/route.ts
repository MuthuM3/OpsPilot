import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  try {
    let dbState = await prisma.conversationState.findUnique({
      where: { chatId }
    });

    if (dbState) {
      const metadata = (dbState.metadata as any) || {};
      
      // Auto-advance workflowState if it is waiting for approval and the approval has been resolved
      if (dbState.workflowState === 'approval_required' && metadata.approvalId) {
        const approval = await prisma.approval.findUnique({
          where: { id: metadata.approvalId }
        });
        
        if (approval) {
          if (approval.status === 'APPROVED') {
            const nextStatus = metadata.code ? 'ACTIVE' : 'COMPLETED';
            dbState = await prisma.conversationState.update({
              where: { chatId },
              data: {
                workflowState: 'completed',
                metadata: {
                  ...metadata,
                  status: nextStatus
                }
              }
            });
          } else if (approval.status === 'REJECTED') {
            dbState = await prisma.conversationState.update({
              where: { chatId },
              data: {
                workflowState: 'completed',
                metadata: {
                  ...metadata,
                  status: 'REJECTED'
                }
              }
            });
          }
        }
      }

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
