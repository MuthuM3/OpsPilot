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
  await prisma.discount.deleteMany({});
  await prisma.conversationState.deleteMany({});

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
        inventory: 15, // Low stock #1
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
    prisma.product.create({
      data: {
        sku: 'PROD-006',
        name: 'Wireless Mouse',
        description: 'Ergonomic wireless mouse with adjustable DPI.',
        price: 899.00,
        inventory: 8, // Low stock #2
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-007',
        name: 'USB-C Hub',
        description: 'Multi-port USB-C adapter with HDMI, USB 3.0, and PD.',
        price: 1299.00,
        inventory: 5, // Low stock #3
        category: 'Electronics',
        supplier: 'VoltAudio Ltd.',
      },
    }),
    prisma.product.create({
      data: {
        sku: 'PROD-008',
        name: 'Laptop Stand',
        description: 'Adjustable aluminum laptop stand for desk ventilation.',
        price: 1999.00,
        inventory: 9, // Low stock #4
        category: 'Furniture',
        supplier: 'ComfortSeat Co.',
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

  // Sarah's order (Delayed shipment #1)
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
        create: [
          {
            productId: products[0].id, // Leather Jacket (4999)
            quantity: 1,
            price: 4999.00,
          },
          {
            productId: products[4].id, // Smartwatch (7200)
            quantity: 1,
            price: 7200.00,
          }
        ]
      },
    },
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
      },
    },
  });

  // John's delayed order (Delayed shipment #2)
  const order7 = await prisma.order.create({
    data: {
      orderNumber: 'ORD-1027',
      customerId: customerJohn.id,
      status: OrderStatus.DELAYED,
      totalAmount: 2199.00,
      items: {
        create: {
          productId: products[7].id, // Laptop Stand
          quantity: 1,
          price: 1999.00,
        },
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
      status: TicketStatus.OPEN, // Open support ticket #1
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
      status: TicketStatus.OPEN, // Open support ticket #2
      priority: TicketPriority.MEDIUM,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-004',
      customerId: customerBob.id,
      subject: 'Payment double charged',
      description: 'I checked my bank statement and I was charged twice for order #ORD-1026. Please check and refund the duplicate payment.',
      status: TicketStatus.OPEN, // Open support ticket #3
      priority: TicketPriority.HIGH,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-005',
      customerId: customerJohn.id,
      subject: 'Incorrect item color received',
      description: 'I received the silver laptop stand instead of the space grey one I ordered. Can I get a replacement?',
      status: TicketStatus.OPEN, // Open support ticket #4
      priority: TicketPriority.MEDIUM,
    },
  });

  await prisma.ticket.create({
    data: {
      ticketNumber: 'TKT-006',
      customerId: customerBob.id,
      subject: 'Promo code VIPSPECIAL50 not applying',
      description: 'I received a promo code VIPSPECIAL50 but it gives me an error at checkout saying approval pending. Please help.',
      status: TicketStatus.OPEN, // Open support ticket #5
      priority: TicketPriority.LOW,
    },
  });

  console.log('Seeding pending approvals...');
  // Approval 1 (Refund request ORD-1024 - Alice Smith)
  const app1 = await prisma.approval.create({
    data: {
      type: 'REFUND_REQUEST',
      status: ApprovalStatus.PENDING, // Pending approval #1
      requestedBy: 'System Auto-Risk',
      reason: 'Refund exceeds ₹10,000 threshold and customer return frequency check flagged (3 refunds in 60 days).',
      metadata: {
        orderId: order4.id,
        orderNumber: 'ORD-1024',
        customerName: 'Alice Smith',
        amount: 12199,
        riskScore: 88,
        explanation: 'Refund blocked because: Customer already requested 3 refunds in 60 days. Refund amount ₹12,199 exceeds ₹10,000 threshold. Active dispute exists.',
        reasons: [
          'Customer already requested 3 refunds in 60 days',
          'Refund amount ₹12,199 exceeds ₹10,000 threshold',
          'Active dispute exists'
        ]
      }
    }
  });

  // Attach Refund record to order4 linked to app1
  await prisma.refund.create({
    data: {
      orderId: order4.id,
      amount: 12199,
      reason: 'Defective product - smartwatch screen scratch',
      status: ApprovalStatus.PENDING,
      riskScore: 88,
      riskExplanation: 'Refund request is flagged due to exceeding single-operator limit and frequency threshold (3 refunds in last 60 days).',
      approvalId: app1.id
    }
  });

  // Approval 2 (Refund request ORD-1025 - Bob Johnson)
  const app2 = await prisma.approval.create({
    data: {
      type: 'REFUND_REQUEST',
      status: ApprovalStatus.PENDING, // Pending approval #2
      requestedBy: 'System Auto-Risk',
      reason: 'Value exceeds operator safe-limit.',
      metadata: {
        orderId: order5.id,
        orderNumber: 'ORD-1025',
        customerName: 'Bob Johnson',
        amount: 3200,
        riskScore: 40,
        explanation: 'Refund requested without prior ticket description. Order is currently in PENDING state.'
      }
    }
  });

  await prisma.refund.create({
    data: {
      orderId: order5.id,
      amount: 3200,
      reason: 'Customer cancelled order before shipping',
      status: ApprovalStatus.PENDING,
      riskScore: 40,
      riskExplanation: 'Refund requested on non-completed order.',
      approvalId: app2.id
    }
  });

  // Approval 3 (Refund request ORD-1026 - Bob Johnson)
  const app3 = await prisma.approval.create({
    data: {
      type: 'REFUND_REQUEST',
      status: ApprovalStatus.PENDING, // Pending approval #3
      requestedBy: 'System Auto-Risk',
      reason: 'Transaction value exceeds high-value safety bounds.',
      metadata: {
        orderId: order6.id,
        orderNumber: 'ORD-1026',
        customerName: 'Bob Johnson',
        amount: 15499,
        riskScore: 75,
        explanation: 'Refund amount ₹15,499 exceeds the ₹10,000 safety threshold.'
      }
    }
  });

  await prisma.refund.create({
    data: {
      orderId: order6.id,
      amount: 15499,
      reason: 'Multiple items return request',
      status: ApprovalStatus.PENDING,
      riskScore: 75,
      riskExplanation: 'Transaction value exceeds high-value safety bounds.',
      approvalId: app3.id
    }
  });

  // Approval 4 (Discount Request VIPSPECIAL50 - 50% discount)
  await prisma.approval.create({
    data: {
      type: 'DISCOUNT_CREATION',
      status: ApprovalStatus.PENDING, // Discount Request #1
      requestedBy: 'Marketing Coordinator',
      reason: 'Promo code exceeds standard policy limit of 20% margin risk.',
      metadata: {
        code: 'VIPSPECIAL50',
        discountPercent: 50,
        riskScore: 65,
        explanation: 'The promo code exceeds the standard 20% policy limit for self-serve discounts.'
      }
    }
  });

  console.log('Seeding discounts...');
  await prisma.discount.createMany({
    data: [
      { code: 'VIP10', discountPercent: 10, status: 'ACTIVE' },
      { code: 'SAVE20', discountPercent: 20, status: 'ACTIVE' },
      { code: 'VIPSPECIAL50', discountPercent: 50, status: 'PENDING_APPROVAL' }
    ]
  });

  // Create Alice's 3 historical refunds to reflect returns history
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
