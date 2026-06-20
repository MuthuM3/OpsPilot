import { NextRequest, NextResponse } from 'next/server';
import { rejectApproval } from '@/lib/approvals/execute';

export async function POST(request: NextRequest) {
  try {
    const { approvalId, reason } = await request.json();
    const result = await rejectApproval(approvalId, reason);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    console.error('Reject Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
