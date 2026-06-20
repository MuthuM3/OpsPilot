import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST() {
  try {
    // 1. Create mock customers if they don't exist
    const customerNames = [
      'John Connor', 'Sarah Connor', 'Peter Parker', 'Bruce Wayne', 'Clark Kent',
      'Diana Prince', 'Barry Allen', 'Tony Stark', 'Steve Rogers', 'Natasha Romanoff'
    ];
    
    const customers = [];
    for (let i = 0; i < customerNames.length; i++) {
      const name = customerNames[i];
      const email = `${name.toLowerCase().replace(' ', '.')}@example.com`;
      const customer = await prisma.customer.upsert({
        where: { email },
        update: {},
        create: {
          name,
          email,
          phone: `+91 98765 4321${i}`
        }
      });
      customers.push(customer);
    }

    // 2. Generate 50 mock orders
    const statuses: Array<'COMPLETED' | 'DELAYED' | 'PENDING'> = ['COMPLETED', 'DELAYED', 'PENDING'];
    for (let i = 0; i < 50; i++) {
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const orderNumber = `ORD-${Math.floor(Math.random() * 9000 + 1000)}`;
      const totalAmount = Math.floor(Math.random() * 15000 + 1500);
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      await prisma.order.upsert({
        where: { orderNumber },
        update: {},
        create: {
          orderNumber,
          customerId: customer.id,
          status,
          totalAmount,
          currency: 'INR'
        }
      });
    }

    // 3. Generate 5 pending approvals
    const approvalTypes: Array<'INVENTORY_UPDATE' | 'REFUND_REQUEST' | 'DISCOUNT_CREATION'> = [
      'REFUND_REQUEST', 'DISCOUNT_CREATION'
    ];

    for (let i = 0; i < 5; i++) {
      const type = approvalTypes[Math.floor(Math.random() * approvalTypes.length)];
      const randNum = Math.floor(Math.random() * 9000 + 1000);
      
      if (type === 'REFUND_REQUEST') {
        const amount = Math.floor(Math.random() * 8000 + 2000);
        await prisma.approval.create({
          data: {
            type,
            status: 'PENDING',
            requestedBy: 'System Auto-Risk',
            metadata: {
              orderId: 'mock-order-id',
              orderNumber: `ORD-${randNum}`,
              customerName: 'Random Customer',
              amount,
              reasons: ['Refund amount exceeds single-operator safety limit', 'Return velocity matches flag criteria'],
              riskScore: Math.floor(Math.random() * 30 + 65),
              explanation: `Refund request for ORD-${randNum} of value ₹${amount.toLocaleString('en-IN')} flagged by policy check.`
            }
          }
        });
      } else if (type === 'DISCOUNT_CREATION') {
        const code = `VIPSPECIAL${randNum}`;
        const discountPercent = Math.floor(Math.random() * 15 + 21); // > 20%
        await prisma.approval.create({
          data: {
            type,
            status: 'PENDING',
            requestedBy: 'Marketing Coordinator',
            metadata: {
              code,
              discountPercent,
              reasons: ['Apology coupon value exceeds 20% limit'],
              riskScore: Math.floor(Math.random() * 20 + 50),
              explanation: `Creation of promo code ${code} for ${discountPercent}% exceeds manager policy limit.`
            }
          }
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Mock data generated successfully' });
  } catch (error: any) {
    console.error('Error generating mock store data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
