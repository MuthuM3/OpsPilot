export type ExecutionStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';
export type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function executionLabel(decision: DecisionStatus, status?: ExecutionStatus | null) {
  if (status === 'SUCCESS') return 'Succeeded';
  if (status === 'FAILED') return 'Failed';
  if (status === 'IN_PROGRESS') return 'In progress';
  if (status === 'PENDING') return 'Not started';
  return decision === 'REJECTED' ? 'Not executed' : 'Not recorded';
}

// A decision alone is never proof of execution, including on repeated requests.
export function processedApprovalResult(status?: ExecutionStatus | null) {
  const success = status === 'SUCCESS';
  return {
    ok: success,
    status: success ? 200 : 409,
    body: {
      success, approvalStatus: 'APPROVED', executionStatus: status ?? null, alreadyProcessed: true,
      ...(success ? {} : { error: `This request was already approved. Execution: ${executionLabel('APPROVED', status).toLowerCase()}. Inspect the audit history before requesting another action.` }),
    },
  };
}
