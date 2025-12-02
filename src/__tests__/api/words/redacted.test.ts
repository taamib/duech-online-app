// /**
//  * Unit tests for the export words API route (redacted and reviewedLex).
//  *
//  * @module __tests__/api/words/export.test
//  */

// import { describe, it, expect, vi, beforeEach } from 'vitest';
// import { GET } from '@/app/api/words/export/route';
// import { expectResponse } from '@/__tests__/utils/test-helpers';
// import { NextResponse } from 'next/server';

// // Mock dependencies
// vi.mock('@/lib/report-words-utils', () => ({
//   authenticateAndFetchRedactedWords: vi.fn(),
// }));

// import * as reportUtils from '@/lib/report-words-utils';

// describe('GET /api/words/export', () => {
//   beforeEach(() => {
//     vi.clearAllMocks();
//   });

//   it('should return 401 if authentication fails', async () => {
//     vi.mocked(reportUtils.authenticateAndFetchRedactedWords).mockResolvedValue({
//       success: false,
//       response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
//     });

//     const response = await GET();
//     const data = await expectResponse<{ error: string }>(response, 401);

//     expect(data.error).toBe('Authentication required');
//   });

//   it('should return redacted words successfully', async () => {
//     const mockWords = [
//       {
//         id: 1,
//         lemma: 'chilenismo',
//         root: 'chile',
//         letter: 'c',
//         status: 'redacted',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         notes: [],
//         meanings: [],
//       },
//       {
//         id: 2,
//         lemma: 'cachai',
//         root: 'cachar',
//         letter: 'c',
//         status: 'redacted',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         notes: [],
//         meanings: [],
//       },
//     ];
//     vi.mocked(reportUtils.authenticateAndFetchRedactedWords).mockResolvedValue({
//       success: true,
//       user: { email: 'admin@duech.cl', name: 'Admin' },
//       words: mockWords as never,
//     });

//     const response = await GET();
//     const data = await expectResponse<{
//       success: boolean;
//       words: typeof mockWords;
//       count: number;
//     }>(response, 200);

//     expect(data.success).toBe(true);
//     expect(data.words).toHaveLength(2);
//     expect(data.count).toBe(2);
//     expect(data.words[0].status).toBe('redacted');
//     expect(data.words[1].status).toBe('redacted');
//   });

//   it('should return reviewedLex words successfully', async () => {
//     const mockWords = [
//       {
//         id: 3,
//         lemma: 'fome',
//         root: 'fome',
//         letter: 'f',
//         status: 'reviewedLex',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         notes: [],
//         meanings: [],
//       },
//       {
//         id: 4,
//         lemma: 'pololo',
//         root: 'pololo',
//         letter: 'p',
//         status: 'reviewedLex',
//         createdAt: new Date(),
//         updatedAt: new Date(),
//         notes: [],
//         meanings: [],
//       },
//     ];
//     vi.mocked(reportUtils.authenticateAndFetchRedactedWords).mockResolvedValue({
//       success: true,
//       user: { email: 'admin@duech.cl', name: 'Admin' },
//       words: mockWords as never,
//     });

//     const response = await GET();
//     const data = await expectResponse<{
//       success: boolean;
//       words: typeof mockWords;
//       count: number;
//     }>(response, 200);

//     expect(data.success).toBe(true);
//     expect(data.words).toHaveLength(2);
//     expect(data.count).toBe(2);
//     expect(data.words[0].status).toBe('reviewedLex');
//     expect(data.words[1].status).toBe('reviewedLex');
//   });

//   it('should return empty array when no words exist', async () => {
//     vi.mocked(reportUtils.authenticateAndFetchRedactedWords).mockResolvedValue({
//       success: true,
//       user: { email: 'admin@duech.cl', name: 'Admin' },
//       words: [],
//     });

//     const response = await GET();
//     const data = await expectResponse<{
//       success: boolean;
//       words: unknown[];
//       count: number;
//     }>(response, 200);

//     expect(data.success).toBe(true);
//     expect(data.words).toHaveLength(0);
//     expect(data.count).toBe(0);
//   });

//   it('should return 500 on unexpected error', async () => {
//     vi.mocked(reportUtils.authenticateAndFetchRedactedWords).mockRejectedValue(
//       new Error('Database error')
//     );

//     const response = await GET();
//     const data = await expectResponse<{ error: string }>(response, 500);

//     expect(data.error).toBe('Failed to fetch redacted words');
//   });
// });
