import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Load the real service and read handler with an in-memory store. No database
// connection, mutation, seed, payment, or vendor call is permitted by this stub.
const root = fileURLToPath(new URL('..', import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) return nextResolve(pathToFileURL(resolve(root, 'src', specifier.slice(2)) + '.ts').href, context);
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier.startsWith('.')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});
let storedApproval;
let listQuery;
let mutations = 0;
const unexpectedWrite = () => { mutations++; throw new Error('Unexpected mutation'); };
globalThis.prisma = {
  approval: {
    findUnique: async () => storedApproval,
    findMany: async query => { listQuery = query; return [storedApproval]; },
    update: unexpectedWrite,
  },
  execution: { create: unexpectedWrite },
};
const { executeApproval } = await import('../src/lib/approvals/execute.ts');
const { GET } = await import('../src/app/api/approvals/route.ts');

test('real approval service never re-executes a decided request or invents success', async () => {
  for (const status of ['FAILED', 'IN_PROGRESS', 'PENDING', null]) {
    storedApproval = { id: 'decided-request', status: 'APPROVED', execution: status ? { status } : null };
    const result = await executeApproval(storedApproval.id);
    assert.equal(result.status, 409);
    assert.equal(result.body.success, false);
    assert.equal(result.body.executionStatus, status);
  }
  storedApproval.execution = { status: 'SUCCESS' };
  const result = await executeApproval(storedApproval.id);
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(mutations, 0);
});
test('approval read contract includes the persisted execution outcome', async () => {
  storedApproval = { id: 'failed-request', status: 'APPROVED', execution: { status: 'FAILED', completedAt: '2026-10-10T00:00:00Z' } };
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(listQuery.include.execution.select, { status: true, completedAt: true });
  const data = await response.json();
  assert.equal(data.approvals[0].status, 'APPROVED');
  assert.equal(data.approvals[0].execution.status, 'FAILED');
});
