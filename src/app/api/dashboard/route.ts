import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const ordersCount = await prisma.order.count();
    const pendingApprovalsCount = await prisma.approval.count({
      where: { status: 'PENDING' }
    });
    
    // Sum approved refunds
    const refunds = await prisma.refund.findMany({
      where: { status: 'APPROVED' },
      select: { amount: true }
    });
    const totalRefundsAmount = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const refundsCount = await prisma.refund.count();

    const skusCount = await prisma.product.count();
    const lowStockCount = await prisma.product.count({
      where: { inventory: { lt: 10 } }
    });

    // Also return list of products for overview
    const products = await prisma.product.findMany({
      orderBy: { sku: 'asc' },
      take: 20
    });

    // Also return recent orders for overview
    const recentOrders = await prisma.order.findMany({
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Also return pending approvals list
    const pendingApprovals = await prisma.approval.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      metrics: {
        ordersCount,
        pendingApprovalsCount,
        totalRefundsAmount,
        skusCount,
        refundsCount,
        lowStockCount
      },
      products,
      recentOrders,
      pendingApprovals
    });
  } catch (error: any) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
