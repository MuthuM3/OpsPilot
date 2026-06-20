import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const executions = await prisma.execution.findMany({
      include: {
        events: {
          orderBy: { timestamp: 'asc' }
        },
        approval: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ executions });
  } catch (error: any) {
    console.error('Timeline API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
