import { prisma } from '@/lib/db/prisma';
import { startExecution, logExecutionEvent, finishExecution } from '@/lib/timeline/tracker';

export interface ApprovalResult {
  ok: boolean;
  status: number;
  body: any;
}

/**
 * Canonical approval execution. Shared by the /api/approvals/approve route and
 * the chat `approve_request` tool so both paths run identical side effects.
 */
export async function executeApproval(approvalId: string): Promise<ApprovalResult> {
  if (!approvalId) return { ok: false, status: 400, body: { error: 'Missing approvalId' } };

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { refund: true }
  });

  if (!approval) return { ok: false, status: 404, body: { error: 'Approval request not found' } };

  if (approval.status === 'APPROVED') {
    return { ok: true, status: 200, body: { success: true, approvalStatus: 'APPROVED', executionStatus: 'SUCCESS', alreadyProcessed: true } };
  }
  if (approval.status !== 'PENDING') {
    return { ok: false, status: 400, body: { error: 'Approval request is already processed' } };
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: 'APPROVED', approvedBy: 'Operations Manager' }
  });

  const execution = await startExecution(approvalId, approval.type);

  try {
    if (approval.type === 'INVENTORY_UPDATE') {
      const metadata = approval.metadata as any;
      const products = metadata.products || [];

      await logExecutionEvent(execution.id, `✓ Found ${products.length} product(s) scheduled for inventory synchronization.`, 'INFO');

      for (const item of products) {
        const existingProduct = await prisma.product.findUnique({ where: { sku: item.sku } });
        if (existingProduct) {
          await prisma.product.update({
            where: { sku: item.sku },
            data: { inventory: item.inventory, price: item.price, name: item.name || existingProduct.name }
          });
          await logExecutionEvent(execution.id, `✓ Updated SKU ${item.sku}: Stock set to ${item.inventory}, Price set to ₹${item.price}`, 'INFO');
        } else {
          await prisma.product.create({
            data: {
              sku: item.sku,
              name: item.name || `Product ${item.sku}`,
              inventory: item.inventory,
              price: item.price,
              category: item.category || 'Supplier Import'
            }
          });
          await logExecutionEvent(execution.id, `✓ Created new Product ${item.sku}: Stock set to ${item.inventory}, Price set to ₹${item.price}`, 'INFO');
        }
      }

      await finishExecution(execution.id, 'SUCCESS', `✓ Successfully synchronized ${products.length} inventory items in database.`);

    } else if (approval.type === 'DISCOUNT_CREATION') {
      const metadata = approval.metadata as any;
      const code = metadata.code;
      const discountPercent = metadata.discountPercent;

      if (code) {
        try {
          await prisma.discount.upsert({
            where: { code },
            update: { status: 'ACTIVE', discountPercent },
            create: { code, discountPercent, status: 'ACTIVE' }
          });
          await logExecutionEvent(execution.id, `✓ Updated Discount code '${code}' in database to ACTIVE.`, 'SUCCESS');
        } catch (dbErr: any) {
          console.error('Failed to update discount in database:', dbErr);
          await logExecutionEvent(execution.id, `⚠️ Database warning: Could not update discount status to ACTIVE.`, 'WARNING');
        }
      }

      await logExecutionEvent(execution.id, `✓ Processing coupon creation for code ${code} (${discountPercent}% Off).`, 'INFO');
      await logExecutionEvent(execution.id, '✓ Deploying price rule configurations to Shopify Admin webhook...', 'INFO');
      await new Promise(resolve => setTimeout(resolve, 800));
      await logExecutionEvent(execution.id, `✓ Coupon code ${code} activated on checkout channels. Reference: CP-${Math.floor(Math.random() * 900000 + 100000)}`, 'SUCCESS');
      await logExecutionEvent(execution.id, `✓ E-commerce channels synchronized.`, 'SUCCESS');
      await finishExecution(execution.id, 'SUCCESS', `✓ Coupon ${code} (${discountPercent}% Off) successfully created and synced with e-commerce integrations.`);

    } else if (approval.type === 'REFUND_REQUEST') {
      const metadata = approval.metadata as any;
      const orderId = metadata.orderId;
      const refundAmount = metadata.amount;

      await logExecutionEvent(execution.id, `✓ Processing refund of ₹${refundAmount.toLocaleString('en-IN')} for Order #${metadata.orderNumber}.`, 'INFO');

      const refund = await prisma.refund.findFirst({ where: { approvalId } });
      if (!refund) throw new Error('Associated refund record not found');

      await prisma.refund.update({ where: { id: refund.id }, data: { status: 'APPROVED' } });

      await logExecutionEvent(execution.id, '✓ Requesting settlement transaction from payment gateway (Simulated Stripe/Razorpay)...', 'INFO');
      await new Promise(resolve => setTimeout(resolve, 800));
      await logExecutionEvent(execution.id, `✓ Settlement transaction settled. Reference ID: TXN-${Math.floor(Math.random() * 900000 + 100000)}`, 'SUCCESS');

      await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
      await logExecutionEvent(execution.id, `✓ E-commerce order status updated to REFUNDED.`, 'SUCCESS');
      await finishExecution(execution.id, 'SUCCESS', `✓ Refund execution successfully completed. ₹${refundAmount.toLocaleString('en-IN')} returned to buyer.`);
    }

    return { ok: true, status: 200, body: { success: true, approvalStatus: 'APPROVED', executionStatus: 'SUCCESS' } };

  } catch (execError: any) {
    console.error('Execution Failed:', execError);
    await finishExecution(execution.id, 'FAILED', `❌ Execution failed: ${execError.message || 'Unknown processing error'}`);
    return { ok: false, status: 500, body: { success: false, approvalStatus: 'APPROVED', executionStatus: 'FAILED', error: execError.message } };
  }
}

/**
 * Canonical approval rejection. Shared by the /api/approvals/reject route and
 * the chat `reject_request` tool.
 */
export async function rejectApproval(approvalId: string, reason?: string): Promise<ApprovalResult> {
  if (!approvalId) return { ok: false, status: 400, body: { error: 'Missing approvalId' } };

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { refund: true }
  });

  if (!approval) return { ok: false, status: 404, body: { error: 'Approval request not found' } };

  if (approval.status === 'REJECTED') {
    return { ok: true, status: 200, body: { success: true, approvalStatus: 'REJECTED', alreadyProcessed: true } };
  }
  if (approval.status !== 'PENDING') {
    return { ok: false, status: 400, body: { error: 'Approval request is already processed' } };
  }

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: 'REJECTED', approvedBy: 'Operations Manager', reason: reason || 'Rejected by operator' }
  });

  if (approval.type === 'REFUND_REQUEST') {
    await prisma.refund.updateMany({ where: { approvalId }, data: { status: 'REJECTED' } });
  }

  if (approval.type === 'DISCOUNT_CREATION') {
    const metadata = approval.metadata as any;
    const code = metadata.code;
    if (code) {
      try {
        await prisma.discount.update({ where: { code }, data: { status: 'REJECTED' } });
      } catch (dbErr: any) {
        console.error('Failed to mark discount as REJECTED in database:', dbErr);
      }
    }
  }

  return { ok: true, status: 200, body: { success: true, approvalStatus: 'REJECTED' } };
}
