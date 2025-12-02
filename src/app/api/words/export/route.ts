import { NextResponse } from 'next/server';
import { authenticateAndFetchRedactedWords } from '@/lib/report-words-utils';
import { requireAdminForApi } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAdminForApi();

    // Authenticate and fetch redacted words
    const result = await authenticateAndFetchRedactedWords();
    if (!result.success) return result.response;

    return NextResponse.json({
      success: true,
      words: result.words,
      count: result.words.length,
    });
  } catch (error) {
    console.error('Error fetching redacted words:', error);
    return NextResponse.json({ error: 'Failed to fetch redacted words' }, { status: 500 });
  }
}
