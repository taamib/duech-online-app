import { NextRequest, NextResponse } from 'next/server';
import { sendRedactedWordsReport } from '@/lib/email';
import {
  authenticateAndFetchWordsByStatus,
  mapWordsByStatusToPdf,
  WordStatusFilter,
} from '@/lib/report-words-utils';
import { generatePDFreport } from '@/lib/pdf-utils';
import { requireAdminForApi } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const user = await requireAdminForApi();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'redacted') as WordStatusFilter;

    const result = await authenticateAndFetchWordsByStatus(type);
    if (!result.success) return result.response;

    const pdfReadyWords = mapWordsByStatusToPdf(result.words);
    const pdfBytes = await generatePDFreport(pdfReadyWords, type);
    const pdfBuffer = Buffer.from(pdfBytes);

    const emailResult = await sendRedactedWordsReport(
      result.user.email,
      result.user.name || result.user.email,
      pdfBuffer
    );

    if (!emailResult.success) {
      console.error('Failed to send report email:', emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: emailResult.error || 'Failed to send email',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      email: result.user.email,
    });
  } catch (error) {
    console.error('Error generating and sending report:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json({ 
      error: 'Failed to generate and send report',
      details: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      fullError: String(error)
    }, { status: 500 });
  }
}
