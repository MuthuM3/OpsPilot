import { NextRequest, NextResponse } from 'next/server';
import { executeApproval } from '@/lib/approvals/execute';

export async function POST(request: NextRequest) {
  try {
    const { approvalId } = await request.json();
    const result = await executeApproval(approvalId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    console.error('Approve Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
