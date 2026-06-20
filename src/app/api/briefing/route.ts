import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// Proactive "what needs your attention" snapshot used to open the chat.
export async function GET() {
  try {
    const [delayed, lowStock, pendingApprovals, openTickets] = await Promise.all([
      prisma.order.count({ where: { status: 'DELAYED' } }),
      prisma.product.findMany({
        where: { inventory: { lt: 20 } },
        orderBy: { inventory: 'asc' },
        take: 3,
      }),
      prisma.approval.findMany({ where: { status: 'PENDING' } }),
      prisma.ticket.count({ where: { status: { not: 'RESOLVED' } } }),
    ]);

    const highRiskApprovals = pendingApprovals.filter(a => {
      const m = a.metadata as any;
      return (m?.riskScore ?? 0) >= 60;
    }).length;

    return NextResponse.json({
      delayed,
      lowStock: lowStock.map(p => ({ sku: p.sku, name: p.name, inventory: p.inventory })),
      pendingApprovals: pendingApprovals.length,
      highRiskApprovals,
      openTickets,
    });
  } catch (error: any) {
    console.error('Briefing error:', error);
    return NextResponse.json({ error: error.message || 'Failed to build briefing' }, { status: 500 });
  }
}
