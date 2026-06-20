import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { evaluateRefundRisk } from '@/lib/approvals/engine';

export async function GET(request: NextRequest) {
  try {
    const refunds = await prisma.refund.findMany({
      include: {
        order: {
          include: { customer: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ refunds });
  } catch (error: any) {
    console.error('Refunds GET Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, reason } = body;

    if (!orderId || !amount || !reason) {
      return NextResponse.json(
        { error: 'Missing orderId, amount, or reason' },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if a refund already exists for this order
    const existingRefund = await prisma.refund.findFirst({
      where: { orderId: order.id }
    });

    if (existingRefund) {
      return NextResponse.json(
        { error: 'A refund has already been requested for this order' },
        { status: 400 }
      );
    }

    // 1. Evaluate refund risk
    const riskAnalysis = await evaluateRefundRisk(orderId, Number(amount));

    // 2. Create Approval record if approval is required
    let approval = null;
    let status: 'PENDING' | 'APPROVED' = 'PENDING';

    if (riskAnalysis.requiresApproval) {
      approval = await prisma.approval.create({
        data: {
          type: 'REFUND_REQUEST',
          status: 'PENDING',
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customer.name,
            amount: Number(amount),
            reasons: riskAnalysis.reasons,
            riskScore: riskAnalysis.riskScore,
            explanation: riskAnalysis.explanation
          }
        }
      });
      status = 'PENDING';
    } else {
      status = 'APPROVED';
      // Low risk - execute immediately (we bypass approvals in simulated low-risk environments)
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'REFUNDED' }
      });
    }

    // 3. Create Refund record
    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        amount: Number(amount),
        reason: reason,
        status: status,
        riskScore: riskAnalysis.riskScore,
        riskExplanation: riskAnalysis.explanation,
        approvalId: approval?.id || null
      }
    });

    return NextResponse.json({
      success: true,
      refund,
      riskAnalysis,
      status
    });

  } catch (error: any) {
    console.error('Refunds POST Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
