import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const approvals = await prisma.approval.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ approvals });
  } catch (error: any) {
    console.error('Approvals GET API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
