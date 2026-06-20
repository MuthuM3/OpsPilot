import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        customer: {
          include: {
            orders: {
              include: {
                items: {
                  include: {
                    product: true
                  }
                },
                refunds: true
              },
              orderBy: {
                createdAt: 'desc'
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ tickets });
  } catch (error: any) {
    console.error('Tickets GET API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
