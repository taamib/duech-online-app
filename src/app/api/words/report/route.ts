import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateAndFetchWordsByStatus,
  mapWordsByStatusToPdf,
  WordStatusFilter,
} from '@/lib/report-words-utils';
import { generatePDFreport } from '@/lib/pdf-utils';
import { requireAdminForApi } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    // Get user session
    const user = await requireAdminForApi();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'redacted') as WordStatusFilter;

    // Authenticate and fetch redacted words
    const result = await authenticateAndFetchWordsByStatus(type);
    if (!result.success) return result.response;

    // Map type to filename
    const filenameMap = {
      redacted: 'reporte_redactadas.pdf',
      reviewedLex: 'reporte_revisadas.pdf',
      both: 'reporte_completo.pdf',
    };

    // Generate PDF
    const pdfReadyWords = mapWordsByStatusToPdf(result.words);
    const pdfBytes = await generatePDFreport(pdfReadyWords, type);

    return new Response(Buffer.from(pdfBytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameMap[type]}"`,
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json({ 
      error: 'Failed to generate report',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      fullError: String(error)
    }, { status: 500 });
  }
}
