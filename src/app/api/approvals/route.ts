import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET() {
  try {
    const approvals = await prisma.approval.findMany({
      orderBy: { createdAt: 'desc' },
      include: { execution: { select: { status: true, completedAt: true } } }
    });

    return NextResponse.json({ approvals });
  } catch (error: unknown) {
    console.error('Approvals GET API Error:', error);
    return NextResponse.json(
      { error: 'Approvals could not be loaded' },
      { status: 500 }
    );
  }
}
