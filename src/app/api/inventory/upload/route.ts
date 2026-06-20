import { NextRequest, NextResponse } from 'next/server';
import { parseCsv, getAiColumnMapping, generatePreview } from '@/lib/csv/mapper';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // Action 1: File upload & Parse (multipart/form-data)
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }
      
      const csvContent = await file.text();
      const { headers, rows } = parseCsv(csvContent);
      
      // Get mapping recommendations from AI
      const mapping = await getAiColumnMapping(headers, rows);
      
      // Generate products preview based on mapping
      const preview = generatePreview(headers, rows, mapping);
      
      // Create record in database
      const upload = await prisma.inventoryUpload.create({
        data: {
          filename: file.name,
          status: 'MAPPED',
          headers,
          mapping: mapping,
          rowCount: rows.length,
        }
      });
      
      return NextResponse.json({
        uploadId: upload.id,
        filename: file.name,
        headers,
        mapping,
        preview,
        rowCount: rows.length
      });
    }
    
    // Action 2: Submit for Approval (application/json)
    const body = await request.json();
    const { action, uploadId, mapping, products } = body;
    
    if (action === 'submit_approval') {
      if (!uploadId || !products || !Array.isArray(products)) {
        return NextResponse.json({ error: 'Missing uploadId or products list' }, { status: 400 });
      }
      
      const upload = await prisma.inventoryUpload.findUnique({
        where: { id: uploadId }
      });
      
      if (!upload) {
        return NextResponse.json({ error: 'Upload record not found' }, { status: 404 });
      }
      
      // Create an approval request
      const approval = await prisma.approval.create({
        data: {
          type: 'INVENTORY_UPDATE',
          status: 'PENDING',
          metadata: {
            uploadId,
            filename: upload.filename,
            mapping,
            productCount: products.length,
            products // List of products to create/update
          }
        }
      });
      
      // Update upload status
      await prisma.inventoryUpload.update({
        where: { id: uploadId },
        data: {
          status: 'APPROVED',
          mapping: mapping
        }
      });
      
      return NextResponse.json({
        success: true,
        approvalId: approval.id,
        status: 'PENDING'
      });
    }

    return NextResponse.json({ error: 'Unsupported request or invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Inventory Upload Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
