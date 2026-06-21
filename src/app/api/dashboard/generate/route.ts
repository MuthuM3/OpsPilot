import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST() {
  try {
    // Spread timestamps across the past N days so time-based analytics
    // ("last month", trends, daily revenue) have realistic data to show.
    const daysAgo = (d: number) =>
      new Date(Date.now() - d * 86_400_000 - Math.floor(Math.random() * 86_400_000));

    console.log('Clearing database for clean generate...');
    // 1. Delete all existing records
    await prisma.executionEvent.deleteMany({});
    await prisma.execution.deleteMany({});
    await prisma.approval.deleteMany({});
    await prisma.refund.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.ticket.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.inventoryUpload.deleteMany({});

    console.log('Generating products...');
    const productsData = [
      {
        sku: 'PROD-001',
        name: 'Premium Leather Jacket',
        description: 'Handcrafted genuine leather jacket with quilted lining.',
        price: 4999.00,
        inventory: 45,
        category: 'Apparel',
        supplier: 'Apex Goods Inc.',
      },
      {
        sku: 'PROD-002',
        name: 'Wireless Noise-Cancelling Headphones',
        description: 'Active noise-cancelling over-ear headphones with 30-hour battery.',
        price: 2499.00,
        inventory: 120,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
      {
        sku: 'PROD-003',
        name: 'Ergonomic Office Chair',
        description: 'High-back mesh office chair with lumbar support and adjustable armrests.',
        price: 8500.00,
        inventory: 15,
        category: 'Furniture',
        supplier: 'ComfortSeat Co.',
      },
      {
        sku: 'PROD-004',
        name: 'Mechanical Gaming Keyboard',
        description: 'RGB mechanical keyboard with tactile brown switches.',
        price: 3200.00,
        inventory: 80,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
      {
        sku: 'PROD-005',
        name: 'Minimalist Smartwatch v2',
        description: 'Water-resistant smartwatch with heart rate monitoring and fitness tracking.',
        price: 6999.00,
        inventory: 35,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      }
    ];

    const products = [];
    for (const p of productsData) {
      const prod = await prisma.product.create({ data: p });
      products.push(prod);
    }

    console.log('Generating customers...');
    const customersData = [
      { name: 'John Doe', email: 'john@example.com', phone: '+919876543210' },
      { name: 'Alice Smith', email: 'alice@example.com', phone: '+919876543211' },
      { name: 'Bob Johnson', email: 'bob@example.com', phone: '+919876543212' },
      { name: 'Sarah Connor', email: 'sarah@example.com', phone: '+919876543213' }
    ];

    const customers: any = {};
    for (const c of customersData) {
      const cust = await prisma.customer.create({ data: c });
      customers[c.email] = cust;
    }

    // List of all customer objects for random selection
    const customerList = Object.values(customers);

    console.log('Generating base tutorial orders...');
    // ORD-1021
    const order1 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1021',
        customerId: customers['john@example.com'].id,
        status: 'COMPLETED',
        totalAmount: 4999.00,
        items: {
          create: {
            productId: products[0].id,
            quantity: 1,
            price: 4999.00,
          }
        }
      }
    });

    // ORD-1022
    const order2 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1022',
        customerId: customers['sarah@example.com'].id,
        status: 'DELAYED',
        totalAmount: 8500.00,
        items: {
          create: {
            productId: products[2].id,
            quantity: 1,
            price: 8500.00,
          }
        }
      }
    });

    // ORD-1023
    const order3 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1023',
        customerId: customers['alice@example.com'].id,
        status: 'COMPLETED',
        totalAmount: 2499.00,
        items: {
          create: {
            productId: products[1].id,
            quantity: 1,
            price: 2499.00,
          }
        }
      }
    });

    // ORD-1024
    const order4 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1024',
        customerId: customers['alice@example.com'].id,
        status: 'COMPLETED',
        totalAmount: 12199.00,
        items: {
          create: [
            {
              productId: products[0].id,
              quantity: 1,
              price: 4999.00,
            },
            {
              productId: products[4].id,
              quantity: 1,
              price: 7200.00,
            }
          ]
        }
      }
    });

    // ORD-1025
    const order5 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1025',
        customerId: customers['bob@example.com'].id,
        status: 'PENDING',
        totalAmount: 3200.00,
        items: {
          create: {
            productId: products[3].id,
            quantity: 1,
            price: 3200.00,
          }
        }
      }
    });

    // ORD-1026
    const order6 = await prisma.order.create({
      data: {
        orderNumber: 'ORD-1026',
        customerId: customers['bob@example.com'].id,
        status: 'COMPLETED',
        totalAmount: 15499.00,
        items: {
          create: [
            {
              productId: products[0].id,
              quantity: 1,
              price: 4999.00,
            },
            {
              productId: products[2].id,
              quantity: 1,
              price: 8500.00,
            },
            {
              productId: products[1].id,
              quantity: 1,
              price: 2000.00,
            }
          ]
        }
      }
    });

    console.log('Generating historical refunds for Alice...');
    for (let i = 1; i <= 3; i++) {
      const refundDate = daysAgo(15 + i * 12); // spread across ~2 months
      const historicalOrder = await prisma.order.create({
        data: {
          orderNumber: `ORD-HIST-${i}`,
          customerId: customers['alice@example.com'].id,
          status: 'REFUNDED',
          totalAmount: 1500.00 * i,
          createdAt: refundDate,
        },
      });
      await prisma.refund.create({
        data: {
          orderId: historicalOrder.id,
          amount: 1500.00 * i,
          reason: `Historical return item ${i}`,
          status: 'APPROVED',
          riskScore: 10.0 * i,
          riskExplanation: 'Automatic low-risk refund in past.',
          createdAt: refundDate,
        }
      });
    }

    console.log('Generating support tickets...');
    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-001',
        customerId: customers['sarah@example.com'].id,
        subject: 'Where is my order #ORD-1022?',
        description: 'The tracking status shows delayed for the last 3 days. This was supposed to be a birthday gift. Please provide an update.',
        status: 'OPEN',
        priority: 'HIGH',
      },
    });

    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-002',
        customerId: customers['john@example.com'].id,
        subject: 'Exchange size request',
        description: 'The Leather Jacket I ordered is a bit too small. I would like to exchange it for a Large instead of Medium.',
        status: 'RESOLVED',
        priority: 'LOW',
      },
    });

    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-003',
        customerId: customers['alice@example.com'].id,
        subject: 'Defective product received',
        description: 'The smartwatch screen has a hairline scratch. I would like a refund for order #ORD-1024 as it is damaged.',
        status: 'OPEN',
        priority: 'MEDIUM',
      },
    });

    await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-004',
        customerId: customers['bob@example.com'].id,
        subject: 'Payment double charged',
        description: 'I checked my bank statement and I was charged twice for order #ORD-1026. Please check and refund the duplicate payment.',
        status: 'OPEN',
        priority: 'HIGH',
      },
    });

    console.log('Generating random bulk orders...');
    const statuses: Array<'COMPLETED' | 'DELAYED' | 'PENDING'> = ['COMPLETED', 'DELAYED', 'PENDING'];
    for (let i = 0; i < 44; i++) {
      const customer: any = customerList[Math.floor(Math.random() * customerList.length)];
      const orderNumber = `ORD-${2000 + i}`;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      // Select 1 to 2 random products for the order
      const prod1 = products[Math.floor(Math.random() * products.length)];
      const prod2 = products[Math.floor(Math.random() * products.length)];
      
      const qty1 = Math.floor(Math.random() * 2) + 1;
      const qty2 = Math.floor(Math.random() * 2) + 1;
      
      const price1 = Number(prod1.price);
      const price2 = Number(prod2.price);
      
      const totalAmount = (price1 * qty1) + (prod1.id !== prod2.id ? (price2 * qty2) : 0);

      await prisma.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          status,
          totalAmount,
          currency: 'INR',
          createdAt: daysAgo(Math.floor(Math.random() * 60)),
          items: {
            create: prod1.id !== prod2.id ? [
              { productId: prod1.id, quantity: qty1, price: price1 },
              { productId: prod2.id, quantity: qty2, price: price2 }
            ] : [
              { productId: prod1.id, quantity: qty1, price: price1 }
            ]
          }
        }
      });
    }

    console.log('Generating pending approvals...');
    // 1. Refund request approval for ORD-1024
    await prisma.approval.create({
      data: {
        type: 'REFUND_REQUEST',
        status: 'PENDING',
        requestedBy: 'System Auto-Risk',
        metadata: {
          orderId: order4.id,
          orderNumber: 'ORD-1024',
          customerName: 'Alice Smith',
          amount: 12199.00,
          reasons: ['Refund amount exceeds single-operator safety limit', 'Refund frequency threshold exceeded (3 in last 30 days)'],
          riskScore: 88,
          explanation: 'Refund request for ORD-1024 of value ₹12,199.00 flagged: Alice Smith has 3 historical refunds.'
        }
      }
    });

    // 2. Discount code approval
    await prisma.approval.create({
      data: {
        type: 'DISCOUNT_CREATION',
        status: 'PENDING',
        requestedBy: 'Marketing Coordinator',
        metadata: {
          code: 'VIPSPECIAL50',
          discountPercent: 50,
          reasons: ['Apology coupon value exceeds 20% limit'],
          riskScore: 65,
          explanation: 'Creation of promo code VIPSPECIAL50 for 50% discount exceeds standard policy limits.'
        }
      }
    });

    // 3. Inventory update approval — use the same metadata shape the execution
    // engine and Approvals Hub expect (products[] + productCount), so the card
    // renders correctly and approving it actually updates the stock.
    await prisma.approval.create({
      data: {
        type: 'INVENTORY_UPDATE',
        status: 'PENDING',
        requestedBy: 'Apex Goods Inc.',
        metadata: {
          filename: 'Restock PROD-001 (Apex Goods)',
          productCount: 1,
          products: [
            { sku: 'PROD-001', name: 'Premium Leather Jacket', price: 4999.00, inventory: 150 }
          ],
          reasons: ['Bulk inventory increase exceeds 100-unit threshold'],
          riskScore: 40,
          explanation: 'Supplier Apex Goods requested inventory adjustment for PROD-001 from 45 to 150 units.'
        }
      }
    });

    console.log('Generating execution audit logs...');
    // Audit Log 1: Completed Payout
    const exec1 = await prisma.execution.create({
      data: {
        type: 'REFUND_REQUEST',
        status: 'SUCCESS',
        startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000 + 3 * 1000),
      }
    });
    await prisma.executionEvent.createMany({
      data: [
        { executionId: exec1.id, message: 'Gateway connection for Stripe processing opened', type: 'INFO', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) },
        { executionId: exec1.id, message: 'Submitting payout request for ORD-1021 (₹4,999.00)', type: 'INFO', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000 + 1 * 1000) },
        { executionId: exec1.id, message: 'Stripe payload signature verified: ch_9s28fjdhsiw', type: 'INFO', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000 + 2 * 1000) },
        { executionId: exec1.id, message: 'Refund transaction recorded and customer John Doe notified', type: 'SUCCESS', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000 + 3 * 1000) }
      ]
    });

    // Audit Log 2: Completed Stock Sync
    const exec2 = await prisma.execution.create({
      data: {
        type: 'INVENTORY_UPDATE',
        status: 'SUCCESS',
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 4 * 1000),
      }
    });
    await prisma.executionEvent.createMany({
      data: [
        { executionId: exec2.id, message: 'Database transaction initialized for inventory sync', type: 'INFO', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        { executionId: exec2.id, message: 'Matching SKU PROD-001 found in Apex Goods catalog', type: 'INFO', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 1 * 1000) },
        { executionId: exec2.id, message: 'Updating inventory level from 35 to 45', type: 'INFO', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 2 * 1000) },
        { executionId: exec2.id, message: 'Prisma write operation verified successfully', type: 'SUCCESS', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000 + 3 * 1000) }
      ]
    });

    return NextResponse.json({ success: true, message: 'Mock data generated successfully' });
  } catch (error: any) {
    console.error('Error generating mock store data:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
