const failReads = process.env.OPSPILOT_REVIEW_STATE === 'error';
const checkRead = value => {
  if (failReads) throw new Error('Isolated read-failure fixture');
  return value;
};
const history = [
  ['failed', 'APPROVED', 'FAILED'],
  ['success', 'APPROVED', 'SUCCESS'],
  ['not-recorded', 'APPROVED', null],
  ['rejected', 'REJECTED', null],
].map(([id, status, executionStatus]) => ({
  id: `fixture-${id}`, type: 'REFUND_REQUEST', status,
  requestedBy: 'Fixture operator', approvedBy: 'Fixture approver',
  reason: status === 'REJECTED' ? 'Fixture rejection' : null,
  metadata: {}, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T01:00:00Z',
  execution: executionStatus ? { status: executionStatus, completedAt: '2026-10-10T01:00:00Z' } : null,
}));
const disallowMutation = () => { throw new Error('Review fixtures do not permit mutations'); };
globalThis.prisma = {
  order: { count: async query => checkRead(query?.where ? 18 : 53), findMany: async () => checkRead([]) },
  approval: { count: async () => checkRead(0), findMany: async query => checkRead(query?.where ? [] : history), update: disallowMutation },
  refund: { count: async () => checkRead(0), findMany: async () => checkRead([]) },
  product: { count: async query => checkRead(query?.where ? 15 : 20), findMany: async () => checkRead([]) },
  ticket: { count: async () => checkRead(0) },
  execution: { create: disallowMutation },
};
