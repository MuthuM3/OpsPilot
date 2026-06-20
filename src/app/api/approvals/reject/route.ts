import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId, reason } = body;

    if (!approvalId) {
      return NextResponse.json({ error: 'Missing approvalId' }, { status: 400 });
    }

    // Fetch approval record
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
      include: { refund: true }
    });

    if (!approval) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (approval.status !== 'PENDING') {
      return NextResponse.json({ error: 'Approval request is already processed' }, { status: 400 });
    }

    // 1. Update Approval status to REJECTED
    await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        approvedBy: 'Operations Manager',
        reason: reason || 'Rejected by operator'
      }
    });

    // 2. If it is a refund, update associated Refund status
    if (approval.type === 'REFUND_REQUEST') {
      await prisma.refund.updateMany({
        where: { approvalId },
        data: { status: 'REJECTED' }
      });
    }

    return NextResponse.json({
      success: true,
      approvalStatus: 'REJECTED'
    });

  } catch (error: any) {
    console.error('Reject Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
