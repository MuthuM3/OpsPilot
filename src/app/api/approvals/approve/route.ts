import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { startExecution, logExecutionEvent, finishExecution } from '@/lib/timeline/tracker';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { approvalId } = body;

    if (!approvalId) {
      return NextResponse.json({ error: 'Missing approvalId' }, { status: 400 });
    }

    // Fetch approval record
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
      include: { refund: true }
    });

    if (!approval) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 });
    }

    if (approval.status !== 'PENDING') {
      return NextResponse.json({ error: 'Approval request is already processed' }, { status: 400 });
    }

    // 1. Update Approval status to APPROVED
    const updatedApproval = await prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        approvedBy: 'Operations Manager'
      }
    });

    // 2. Start Execution & Track Timeline
    const execution = await startExecution(approvalId, approval.type);

    try {
      if (approval.type === 'INVENTORY_UPDATE') {
        const metadata = approval.metadata as any;
        const products = metadata.products || [];

        await logExecutionEvent(
          execution.id,
          `✓ Found ${products.length} product(s) scheduled for inventory synchronization.`,
          'INFO'
        );

        // Perform upserts in a database transaction
        for (const item of products) {
          const existingProduct = await prisma.product.findUnique({
            where: { sku: item.sku }
          });

          if (existingProduct) {
            await prisma.product.update({
              where: { sku: item.sku },
              data: {
                inventory: item.inventory,
                price: item.price,
                name: item.name || existingProduct.name
              }
            });
            await logExecutionEvent(
              execution.id,
              `✓ Updated SKU ${item.sku}: Stock set to ${item.inventory}, Price set to ₹${item.price}`,
              'INFO'
            );
          } else {
            await prisma.product.create({
              data: {
                sku: item.sku,
                name: item.name || `Product ${item.sku}`,
                inventory: item.inventory,
                price: item.price,
                category: 'Supplier Import'
              }
            });
            await logExecutionEvent(
              execution.id,
              `✓ Created new Product ${item.sku}: Stock set to ${item.inventory}, Price set to ₹${item.price}`,
              'INFO'
            );
          }
        }

        // Finish execution successfully
        await finishExecution(
          execution.id,
          'SUCCESS',
          `✓ Successfully synchronized ${products.length} inventory items in database.`
        );

      } else if (approval.type === 'DISCOUNT_CREATION') {
        const metadata = approval.metadata as any;
        const code = metadata.code;
        const discountPercent = metadata.discountPercent;

        await logExecutionEvent(
          execution.id,
          `✓ Processing coupon creation for code ${code} (${discountPercent}% Off).`,
          'INFO'
        );

        await logExecutionEvent(
          execution.id,
          '✓ Deploying price rule configurations to Shopify Admin webhook...',
          'INFO'
        );

        // Simulate gateway latency/delay
        await new Promise(resolve => setTimeout(resolve, 800));

        await logExecutionEvent(
          execution.id,
          `✓ Coupon code ${code} activated on checkout channels. Reference: CP-${Math.floor(Math.random() * 900000 + 100000)}`,
          'SUCCESS'
        );

        await logExecutionEvent(
          execution.id,
          `✓ E-commerce channels synchronized.`,
          'SUCCESS'
        );

        // Finish execution successfully
        await finishExecution(
          execution.id,
          'SUCCESS',
          `✓ Coupon ${code} (${discountPercent}% Off) successfully created and synced with e-commerce integrations.`
        );

      } else if (approval.type === 'REFUND_REQUEST') {
        const metadata = approval.metadata as any;
        const orderId = metadata.orderId;
        const refundAmount = metadata.amount;

        await logExecutionEvent(
          execution.id,
          `✓ Processing refund of ₹${refundAmount.toLocaleString('en-IN')} for Order #${metadata.orderNumber}.`,
          'INFO'
        );

        // Fetch Refund record linked to approval
        const refund = await prisma.refund.findFirst({
          where: { approvalId }
        });

        if (!refund) {
          throw new Error('Associated refund record not found');
        }

        // Update refund status to APPROVED (or EXECUTED)
        await prisma.refund.update({
          where: { id: refund.id },
          data: { status: 'APPROVED' }
        });

        await logExecutionEvent(
          execution.id,
          '✓ Requesting settlement transaction from payment gateway (Simulated Stripe/Razorpay)...',
          'INFO'
        );

        // Simulate gateway latency/delay
        await new Promise(resolve => setTimeout(resolve, 800));

        await logExecutionEvent(
          execution.id,
          `✓ Settlement transaction settled. Reference ID: TXN-${Math.floor(Math.random() * 900000 + 100000)}`,
          'SUCCESS'
        );

        // Update Order status in the database
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'REFUNDED' }
        });

        await logExecutionEvent(
          execution.id,
          `✓ E-commerce order status updated to REFUNDED.`,
          'SUCCESS'
        );

        // Finish execution successfully
        await finishExecution(
          execution.id,
          'SUCCESS',
          `✓ Refund execution successfully completed. ₹${refundAmount.toLocaleString('en-IN')} returned to buyer.`
        );
      }

      return NextResponse.json({
        success: true,
        approvalStatus: 'APPROVED',
        executionStatus: 'SUCCESS'
      });

    } catch (execError: any) {
      console.error('Execution Failed:', execError);
      
      // Update execution status to FAILED
      await finishExecution(
        execution.id,
        'FAILED',
        `❌ Execution failed: ${execError.message || 'Unknown processing error'}`
      );

      return NextResponse.json({
        success: false,
        approvalStatus: 'APPROVED',
        executionStatus: 'FAILED',
        error: execError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Approve Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
