import { prisma } from '../db/prisma';
import { ApprovalType, ExecutionStatus, EventType } from '@prisma/client';

export async function startExecution(
  approvalId: string,
  type: ApprovalType
) {
  // Create the execution
  const execution = await prisma.execution.create({
    data: {
      approvalId,
      type,
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    }
  });

  // Log initial start event
  await logExecutionEvent(
    execution.id,
    `✓ Execution started for ${type === 'INVENTORY_UPDATE' ? 'inventory synchronization' : 'refund transaction'}.`,
    'INFO'
  );

  return execution;
}

export async function logExecutionEvent(
  executionId: string,
  message: string,
  type: EventType = 'INFO'
) {
  return await prisma.executionEvent.create({
    data: {
      executionId,
      message,
      type,
      timestamp: new Date()
    }
  });
}

export async function finishExecution(
  executionId: string,
  status: ExecutionStatus,
  summaryMessage?: string
) {
  // Log final status event
  const isSuccess = status === 'SUCCESS';
  await logExecutionEvent(
    executionId,
    summaryMessage || (isSuccess ? '✓ Execution completed successfully.' : '❌ Execution failed.'),
    isSuccess ? 'SUCCESS' : 'ERROR'
  );

  // Update execution status
  return await prisma.execution.update({
    where: { id: executionId },
    data: {
      status,
      completedAt: new Date()
    }
  });
}
