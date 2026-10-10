import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOperations } from '../src/lib/dashboard/summary.ts';
import { executionLabel, processedApprovalResult } from '../src/lib/approvals/outcome.ts';

test('recorded counts remain exact and alerts derive from the same snapshot', () => {
  const metrics = { ordersCount: 53, delayedShipmentsCount: 18, lowStockCount: 15, pendingApprovalsCount: 0 };
  const summary = summarizeOperations(metrics);
  assert.deepEqual(summary.metrics, metrics);
  assert.equal(summary.status, 'Needs attention');
  assert.deepEqual(summary.alerts.map(a => [a.href, a.count]), [['/dashboard#demo-guide', 18], ['/inventory', 15]]);
});
test('a valid empty snapshot differs from missing or invalid data', () => {
  assert.equal(summarizeOperations(), null);
  assert.equal(summarizeOperations({ ordersCount: 1 }), null);
  assert.equal(summarizeOperations({ ordersCount: 0, delayedShipmentsCount: -1, lowStockCount: 0, pendingApprovalsCount: 0 }), null);
  assert.equal(summarizeOperations({ ordersCount: 0, delayedShipmentsCount: 0, lowStockCount: 0, pendingApprovalsCount: 0 }).status, 'No flagged items');
});
test('approval decisions cannot invent an execution outcome', () => {
  assert.equal(executionLabel('APPROVED', 'FAILED'), 'Failed');
  assert.equal(executionLabel('APPROVED', 'SUCCESS'), 'Succeeded');
  assert.equal(executionLabel('APPROVED', 'IN_PROGRESS'), 'In progress');
  assert.equal(executionLabel('APPROVED', 'PENDING'), 'Not started');
  assert.equal(executionLabel('APPROVED', null), 'Not recorded');
  assert.equal(executionLabel('REJECTED', null), 'Not executed');
});
test('repeating an approved request preserves failed, pending, and missing results', () => {
  for (const status of ['FAILED', 'IN_PROGRESS', 'PENDING', null, undefined]) {
    const result = processedApprovalResult(status);
    assert.equal(result.status, 409);
    assert.equal(result.body.success, false);
    assert.equal(result.body.executionStatus, status ?? null);
    assert.equal(result.body.alreadyProcessed, true);
  }
  assert.equal(processedApprovalResult('SUCCESS').body.success, true);
  assert.equal(processedApprovalResult('SUCCESS').status, 200);
});
