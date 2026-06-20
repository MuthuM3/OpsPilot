import { PrismaClient, OrderStatus, TicketStatus, TicketPriority, ApprovalStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
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

  console.log('Seeding products...');
  const products = await Promise.all([
    prisma.product.create({
      data: {
        sku: 'PROD-001',
        name: 'Premium Leather Jacket',
        description: 'Handcrafted genuine leather jacket with quilted lining.',
        price: 4999.00,
        inventory: 45,
        category: 'Apparel',
        supplier: 'Apex Goods Inc.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-002',
        name: 'Wireless Noise-Cancelling Headphones',
        description: 'Active noise-cancelling over-ear headphones with 30-hour battery.',
        price: 2499.00,
        inventory: 120,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-003',
        name: 'Ergonomic Office Chair',
        description: 'High-back mesh office chair with lumbar support and adjustable armrests.',
        price: 8500.00,
        inventory: 15,
        category: 'Furniture',
        supplier: 'ComfortSeat Co.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-004',
        name: 'Mechanical Gaming Keyboard',
        description: 'RGB mechanical keyboard with tactile brown switches.',
        price: 3200.00,
        inventory: 80,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-005',
        name: 'Minimalist Smartwatch v2',
        description: 'Water-resistant smartwatch with heart rate monitoring and fitness tracking.',
        price: 6999.00,
        inventory: 35,
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
    }),
  ]);

  console.log('Seeding customers...');
  const customerJohn = await prisma.customer.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+919876543210',
    },
  });

  const customerAlice = await prisma.customer.create({
    data: {
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+919876543211',
    },
  });

  const customerBob = await prisma.customer.create({
    data: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      phone: '+919876543212',
    },
  });

  const customerSarah = await prisma.customer.create({
    data: {
      name: 'Sarah Connor',
      email: 'sarah@example.com',
      phone: '+919876543213',
    },
  });

  console.log('Seeding orders...');
  // John's order
  const order1 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1021',
      customerId: customerJohn.id,
      status: OrderStatus.COMPLETED,
      totalAmount: 4999.00,
      items: {
        create: {
          productId: products[0].id, // Leather Jacket
          quantity: 1,
          price: 4999.00,
        },
      },
    },
  });

  // Sarah's order (Delayed shipment)
  const order2 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1022',
      customerId: customerSarah.id,
      status: OrderStatus.DELAYED,
      totalAmount: 8500.00,
      items: {
        create: {
          productId: products[2].id, // Ergonomic Office Chair
          quantity: 1,
          price: 8500.00,
        },
      },
    },
  });

  // Alice's completed low-value order
  const order3 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1023',
      customerId: customerAlice.id,
      status: OrderStatus.COMPLETED,
      totalAmount: 2499.00,
      items: {
        create: {
          productId: products[1].id, // Wireless Headphones
          quantity: 1,
          price: 2499.00,
        },
      },
    },
  });

  // Alice's high-value order (target for refund demo)
  const order4 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1024',
      customerId: customerAlice.id,
      status: OrderStatus.COMPLETED,
      totalAmount: 12199.00,
      items: {
        create: {
          productId: products[0].id, // Leather Jacket (4999)
          quantity: 1,
          price: 4999.00,
        },
      },
    },
  });
  // Add a second item to ORD-1024 to make it 12,199
  await prisma.orderItem.create({
    data: {
      orderId: order4.id,
      productId: products[4].id, // Smartwatch (6999)
      quantity: 1,
      price: 7200.00, // Adjusted price
    },
  });
  // Update order4 total
  await prisma.order.update({
    where: { id: order4.id },
    data: { totalAmount: 12199.00 }
  });

  // Bob's orders
  const order5 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1025',
      customerId: customerBob.id,
      status: OrderStatus.PENDING,
      totalAmount: 3200.00,
      items: {
        create: {
          productId: products[3].id, // Mechanical Keyboard
          quantity: 1,
          price: 3200.00,
        },
      },
    },
  });

  const order6 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1026',
      customerId: customerBob.id,
      status: OrderStatus.COMPLETED,
      totalAmount: 15499.00,
      items: {
        create: [
          {
            productId: products[0].id, // Leather Jacket (4999)
            quantity: 1,
            price: 4999.00,
          },
          {
            productId: products[2].id, // Chair (8500)
            quantity: 1,
            price: 8500.00,
          },
          {
            productId: products[1].id, // Headphones (2000 - sale)
            quantity: 1,
            price: 2000.00,
          }
        ]
      },
    },
  });

  console.log('Seeding support tickets...');
  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-001',
      customerId: customerSarah.id,
      subject: 'Where is my order #ORD-1022?',
      description: 'The tracking status shows delayed for the last 3 days. This was supposed to be a birthday gift. Please provide an update.',
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-002',
      customerId: customerJohn.id,
      subject: 'Exchange size request',
      description: 'The Leather Jacket I ordered is a bit too small. I would like to exchange it for a Large instead of Medium.',
      status: TicketStatus.RESOLVED,
      priority: TicketPriority.LOW,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-003',
      customerId: customerAlice.id,
      subject: 'Defective product received',
      description: 'The smartwatch screen has a hairline scratch. I would like a refund for order #ORD-1024 as it is damaged.',
      status: TicketStatus.OPEN,
      priority: TicketPriority.MEDIUM,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-004',
      customerId: customerBob.id,
      subject: 'Payment double charged',
      description: 'I checked my bank statement and I was charged twice for order #ORD-1026. Please check and refund the duplicate payment.',
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
    },
  });

  // Seed previous refund count simulation context for Alice
  // We can simulate Alice having had 3 previous refunds by creating three refund records already marked as APPROVED/EXECUTED.
  // Wait, let's create a few mock refunds for Alice to make the risk engine query reflect a history of 3 previous refunds!
  // To do that, we create 3 old refunded orders or we can write the count directly or query them.
  // Creating historical refund entries is better! Let's do that:
  // Create orders for Alice that are refunded
  for (let i = 1; i <= 3; i++) {
    const historicalOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-HIST-${i}`,
        customerId: customerAlice.id,
        status: OrderStatus.REFUNDED,
        totalAmount: 1500.00 * i,
      },
    });
    await prisma.refund.create({
      data: {
        orderId: historicalOrder.id,
        amount: 1500.00 * i,
        reason: `Historical return item ${i}`,
        status: ApprovalStatus.APPROVED,
        riskScore: 10.0 * i,
        riskExplanation: 'Automatic low-risk refund in past.',
      }
    });
  }

  console.log('Seeding complete! Initialized e-commerce mock database successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
