/**
 * Database query functions using Drizzle ORM.
 *
 * This module provides all database access functions for the dictionary
 * application. It uses Drizzle ORM for type-safe database queries against
 * the PostgreSQL backend.
 *
 * ## Function Categories
 *
 * ### Word Queries
 * - {@link getWordByLemma} - Retrieve a single word with all its data
 * - {@link searchWords} - Search words with flexible filtering and pagination
 * - {@link getWordsByStatus} - Get words pending review
 * - {@link getRedactedWords} - Get redacted words for reports
 * - {@link getReviewedLexWords} - Get lexicographically reviewed words for reports
 * - {@link getWordsBySource} - Get words by publication source
 *
 * ### User Management
 * - {@link getUserByUsername} - Find user by username
 * - {@link getUserByEmail} - Find user by email
 * - {@link getUserById} - Find user by ID
 * - {@link getUsers} - Get all users
 * - {@link createUser} - Create new user
 * - {@link updateUser} - Update user data
 * - {@link deleteUser} - Delete user
 *
 * ### Authentication
 * - {@link verifyUserPassword} - Verify password against hash
 * - {@link hashPassword} - Create bcrypt hash
 * - {@link updateUserSessionId} - Track user sessions
 *
 * ### Password Reset
 * - {@link createPasswordResetToken} - Generate reset token
 * - {@link getPasswordResetToken} - Retrieve token with user
 * - {@link deletePasswordResetToken} - Clean up used tokens
 *
 * ### Utilities
 * - {@link getUniqueSources} - Get bibliography dropdown options
 *
 * ## Query Patterns
 *
 * Most functions follow these patterns:
 * - Return null/undefined for not found (single item)
 * - Return empty array for no results (collections)
 * - Use Drizzle query builder for complex queries
 * - Use raw SQL for advanced text search (unaccent, LIKE)
 *
 * @module lib/queries
 * @see {@link db} - Database connection
 * @see {@link SearchWordsParams} - Search parameters type
 */

import { eq, ilike, or, and, sql, SQL, isNotNull, asc, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '@/lib/db';
import { words, meanings, users, passwordResetTokens, examples } from '@/lib/schema';
import {
  Word,
  SearchResult,
  WordNote,
  MarkerFilterState,
  MEANING_MARKER_KEYS,
} from '@/lib/definitions';
import { dbWordToWord, dbWordToSearchResult } from '@/lib/transformers';

/**
 * Common word columns for queries
 */
const WORD_COLUMNS = {
  id: true,
  lemma: true,
  root: true,
  letter: true,
  variant: true,
  status: true,
  createdBy: true,
  assignedTo: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Get a word by lemma with all its meanings
 * Returns in frontend-compatible format
 */
interface GetWordByLemmaOptions {
  includeDrafts?: boolean;
}

/**
 * Retrieves a word by its lemma with all associated meanings and notes.
 *
 * @param lemma - The dictionary headword to look up
 * @param options - Query options
 * @param options.includeDrafts - If true, includes non-published words
 * @returns Word data with metadata, or null if not found
 *
 * @example
 * ```typescript
 * // Public lookup (published only)
 * const result = await getWordByLemma('chilenismo');
 *
 * // Editor lookup (all statuses)
 * const result = await getWordByLemma('chilenismo', { includeDrafts: true });
 * ```
 */
export async function getWordByLemma(
  lemma: string,
  options: GetWordByLemmaOptions = {}
): Promise<{
  word: Word;
  letter: string;
  status: string;
  assignedTo: number | null;
  createdBy: number | null;
  wordId: number;
  comments: WordNote[];
} | null> {
  const { includeDrafts = false } = options;

  const whereCondition = includeDrafts
    ? eq(words.lemma, lemma)
    : and(eq(words.lemma, lemma), eq(words.status, 'published'));

  const result = await db.query.words.findFirst({
    where: whereCondition,
    columns: WORD_COLUMNS,
    with: {
      meanings: {
        orderBy: (meaningsTable, { asc }) => [asc(meaningsTable.number)],
        with: {
          examples: true,
        },
      },
      notes: {
        orderBy: (notesTable, { desc }) => [desc(notesTable.createdAt)],
        with: {
          user: true,
        },
      },
    },
  });

  if (!result) return null;

  return {
    word: dbWordToWord(result),
    letter: result.letter,
    status: result.status,
    assignedTo: result.assignedTo ?? null,
    createdBy: result.createdBy ?? null,
    wordId: result.id,
    comments:
      result.notes?.map((note) => ({
        id: note.id,
        note: note.note,
        createdAt: note.createdAt.toISOString(),
        user: note.user
          ? {
              id: note.user.id,
              username: note.user.username,
            }
          : null,
      })) ?? [],
  };
}

/**
 * Maps marker keys to their corresponding database columns.
 * @internal
 */
const MARKER_COLUMN_MAP = {
  socialValuations: meanings.socialValuations,
  socialStratumMarkers: meanings.socialStratumMarkers,
  styleMarkers: meanings.styleMarkers,
  intentionalityMarkers: meanings.intentionalityMarkers,
  geographicalMarkers: meanings.geographicalMarkers,
  chronologicalMarkers: meanings.chronologicalMarkers,
  frequencyMarkers: meanings.frequencyMarkers,
} as const;

/**
 * Parameters for the searchWords function.
 */
export type SearchWordsParams = {
  /** Text query to search in lemmas */
  query?: string;
  /** Filter by grammatical categories */
  categories?: string[];
  /** Filter by etymology/origins */
  origins?: string[];
  /** Filter by first letter */
  letters?: string[];
  /** Filter by source dictionary */
  dictionaries?: string[];
  /** Filter by editorial status */
  status?: string;
  /** Filter by assigned user IDs */
  assignedTo?: string[];
  /** If true, includes all statuses; otherwise only published */
  editorMode?: boolean;
  /** Maximum results (deprecated, use pageSize) */
  limit?: number;
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page */
  pageSize?: number;
} & MarkerFilterState;

/**
 * Searches words with flexible filtering and pagination.
 *
 * Supports text search (prefix, inline, and contains matching),
 * multiple filter criteria, and pagination. Results are sorted
 * by match quality and then alphabetically.
 *
 * @param params - Search parameters and filters
 * @returns Search results with total count
 *
 * @example
 * ```typescript
 * // Simple text search
 * const { results, total } = await searchWords({ query: 'chile' });
 *
 * // Filtered search
 * const { results, total } = await searchWords({
 *   letters: ['a'],
 *   categories: ['m', 'f'],
 *   page: 1,
 *   pageSize: 25
 * });
 * ```
 */
export async function searchWords(params: SearchWordsParams): Promise<{
  results: SearchResult[];
  total: number;
}> {
  const {
    query,
    categories,
    origins,
    letters,
    dictionaries,
    status,
    assignedTo,
    editorMode,
    page = 1,
    pageSize = 25,
  } = params;

  const markerFilters = MEANING_MARKER_KEYS.reduce((acc, key) => {
    const values = params[key];
    if (values && values.length > 0) {
      acc[key] = values;
    }
    return acc;
  }, {} as MarkerFilterState);

  const conditions: SQL[] = [];

  if (!editorMode) {
    conditions.push(eq(words.status, 'published'));
  } else if (status && status !== '') {
    conditions.push(eq(words.status, status));
  }

  if (assignedTo && assignedTo.length > 0) {
    const assignedToIds = assignedTo.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
    if (assignedToIds.length > 0) {
      conditions.push(or(...assignedToIds.map((id) => eq(words.assignedTo, id)))!);
    }
  }

  let normalizedQuery: string | null = null;
  let prefixPattern: string | null = null;
  let inlinePattern: string | null = null;
  let containsPattern: string | null = null;

  if (query) {
    normalizedQuery = query.trim();
    if (normalizedQuery.length > 0) {
      prefixPattern = `${normalizedQuery}%`;
      inlinePattern = `% ${normalizedQuery}%`;
      containsPattern = `%${normalizedQuery}%`;
      conditions.push(
        or(
          sql`unaccent(lower(${words.lemma})) LIKE unaccent(lower(${prefixPattern}))`,
          sql`unaccent(lower(${words.lemma})) LIKE unaccent(lower(${inlinePattern}))`,
          sql`unaccent(lower(${words.lemma})) LIKE unaccent(lower(${containsPattern}))`
        )!
      );
    } else {
      normalizedQuery = null;
    }
  }

  if (letters && letters.length > 0) {
    conditions.push(or(...letters.map((letter) => eq(words.letter, letter.toLowerCase())))!);
  }

  if (origins && origins.length > 0) {
    conditions.push(or(...origins.map((origin) => ilike(meanings.origin, `%${origin}%`)))!);
  }

  if (dictionaries && dictionaries.length > 0) {
    conditions.push(or(...dictionaries.map((dict) => eq(meanings.dictionary, dict)))!);
  }

  if (categories && categories.length > 0) {
    conditions.push(or(...categories.map((cat) => eq(meanings.grammarCategory, cat)))!);
  }

  for (const key of MEANING_MARKER_KEYS) {
    const values = markerFilters[key];
    if (values && values.length > 0) {
      const column = MARKER_COLUMN_MAP[key];
      conditions.push(or(...values.map((value) => eq(column, value)))!);
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countResult = await db
    .select({ count: sql<number>`count(distinct ${words.id})` })
    .from(words)
    .leftJoin(meanings, eq(words.id, meanings.wordId))
    .where(whereClause);

  const total = Number(countResult[0]?.count || 0);

  const offset = (page - 1) * pageSize;
  const alphabeticalOrderExpression = sql`unaccent(lower(${words.lemma}))`;
  const matchPriorityExpression =
    normalizedQuery && prefixPattern && inlinePattern && containsPattern
      ? sql<number>`
          CASE
            WHEN unaccent(lower(${words.lemma})) = unaccent(lower(${normalizedQuery})) THEN 0
            WHEN unaccent(lower(${words.lemma})) LIKE unaccent(lower(${prefixPattern})) THEN 1
            WHEN unaccent(lower(${words.lemma})) LIKE unaccent(lower(${inlinePattern})) THEN 2
            WHEN unaccent(lower(${words.lemma})) LIKE unaccent(lower(${containsPattern})) THEN 3
            ELSE 4
          END
        `
      : sql<number>`4`;

  const results = await db
    .select({
      id: words.id,
      lemma: words.lemma,
      root: words.root,
      letter: words.letter,
      variant: words.variant,
      status: words.status,
      createdBy: words.createdBy,
      assignedTo: words.assignedTo,
      createdAt: words.createdAt,
      updatedAt: words.updatedAt,
    })
    .from(words)
    .leftJoin(meanings, eq(words.id, meanings.wordId))
    .where(whereClause)
    .groupBy(
      words.id,
      words.lemma,
      words.root,
      words.letter,
      words.variant,
      words.status,
      words.createdBy,
      words.assignedTo,
      words.createdAt,
      words.updatedAt
    )
    .orderBy(matchPriorityExpression, alphabeticalOrderExpression)
    .limit(pageSize)
    .offset(offset);

  const wordIds = results.map((w) => w.id);

  const fullWords = await db.query.words.findMany({
    where: (words, { inArray }) => inArray(words.id, wordIds),
    with: {
      meanings: {
        orderBy: (meanings, { asc }) => [asc(meanings.number)],
      },
    },
  });

  const wordMap = new Map(fullWords.map((w) => [w.id, w]));

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  type MatchCategory = 'exact' | 'prefix' | 'inline' | 'partial' | 'filter';
  const bucketOrder: MatchCategory[] = ['exact', 'prefix', 'inline', 'partial', 'filter'];

  const wordsWithMeanings = results.map((w) => {
    const fullWord = wordMap.get(w.id);
    let matchType: MatchCategory = 'filter';

    if (query && fullWord) {
      const normalizedQueryForMatch = normalize(query);
      const lemma = normalize(fullWord.lemma);

      if (normalizedQueryForMatch.length === 0) {
        matchType = 'filter';
      } else if (lemma === normalizedQueryForMatch) {
        matchType = 'exact';
      } else if (lemma.startsWith(normalizedQueryForMatch)) {
        matchType = 'prefix';
      } else {
        const tokens = lemma.split(/\s+/).map((token) => token.replace(/^[^a-z0-9]+/i, ''));
        const hasInlineMatch = tokens.some((token) => token.startsWith(normalizedQueryForMatch));

        if (hasInlineMatch) {
          matchType = 'inline';
        } else if (lemma.includes(normalizedQueryForMatch)) {
          matchType = 'partial';
        }
      }
    }

    return { fullWord, matchType };
  });

  const compareLemma = (
    a: { fullWord: (typeof fullWords)[number] | undefined },
    b: { fullWord: (typeof fullWords)[number] | undefined }
  ) => {
    const lemmaA = a.fullWord!.lemma;
    const lemmaB = b.fullWord!.lemma;
    return lemmaA.localeCompare(lemmaB, 'es', { sensitivity: 'base' });
  };

  const orderedResults = bucketOrder.flatMap((bucket) =>
    wordsWithMeanings
      .filter((entry) => entry.fullWord && entry.matchType === bucket)
      .sort(compareLemma)
  );

  const finalResults = orderedResults.map((w) => {
    const mappedMatch: 'filter' | 'partial' | 'exact' | undefined =
      w.matchType === 'exact'
        ? 'exact'
        : w.matchType === 'partial' || w.matchType === 'prefix' || w.matchType === 'inline'
          ? 'partial'
          : 'filter';

    return dbWordToSearchResult(w.fullWord!, mappedMatch);
  });

  return {
    results: finalResults,
    total,
  };
}

// ============================================================================
// USER AUTHENTICATION QUERIES
// ============================================================================

/**
 * Finds a user by username (case-insensitive).
 *
 * @param username - The username to search for
 * @returns The user record or null if not found
 */
export async function getUserByUsername(username: string) {
  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Finds a user by email address (case-insensitive).
 *
 * @param email - The email address to search for
 * @returns The user record or null if not found
 */
export async function getUserByEmail(email: string) {
  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Verifies a plain-text password against a bcrypt hash.
 *
 * @param dbPasswordHash - The stored bcrypt hash
 * @param password - The plain-text password to verify
 * @returns True if the password matches, false otherwise
 */
export async function verifyUserPassword(
  dbPasswordHash: string,
  password: string
): Promise<boolean> {
  return await bcrypt.compare(password, dbPasswordHash);
}

/**
 * Retrieves all users with selected fields (excludes password hash).
 *
 * @returns Array of user records with id, username, email, role, and createdAt
 */
export async function getUsers() {
  return await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users);
}

/**
 * Retrieves users filtered by roles that the current user can see.
 * Admins cannot see superadmins - they shouldn't know they exist.
 *
 * @param visibleRoles - Array of roles that should be visible to the current user
 * @returns Array of user records with id, username, email, role, and createdAt
 */
export async function getUsersFiltered(visibleRoles: string[]) {
  return await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(inArray(users.role, visibleRoles));
}

/**
 * Hashes a password using bcrypt with cost factor 10.
 *
 * @param password - The plain-text password to hash
 * @returns The bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Creates a new user in the database.
 *
 * @param data - User data including username, email, passwordHash, and role
 * @returns The created user record
 */
export async function createUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  role: string;
}) {
  const result = await db
    .insert(users)
    .values({
      username: data.username,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
    })
    .returning({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    });

  return result[0];
}

/**
 * Updates an existing user's data.
 *
 * @param userId - The user's database ID
 * @param data - Fields to update (username, email, role, passwordHash, currentSessionId)
 * @returns The updated user record
 */
export async function updateUser(
  userId: number,
  data: {
    username?: string;
    email?: string;
    role?: string;
    passwordHash?: string;
    currentSessionId?: string | null;
  }
) {
  const result = await db
    .update(users)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      updatedAt: users.updatedAt,
    });

  return result[0];
}

/**
 * Updates a user's current session ID.
 * Used to track active sessions and invalidate concurrent logins.
 *
 * @param userId - The user's database ID
 * @param sessionId - The new session ID to set
 */
export async function updateUserSessionId(userId: number, sessionId: string) {
  await db
    .update(users)
    .set({
      currentSessionId: sessionId,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Deletes a user from the database.
 *
 * @param userId - The user's database ID
 * @returns The deleted user's id and username
 */
export async function deleteUser(userId: number) {
  const result = await db.delete(users).where(eq(users.id, userId)).returning({
    id: users.id,
    username: users.username,
  });

  return result[0];
}

/**
 * Retrieves a user by their database ID.
 *
 * @param userId - The user's database ID
 * @returns User record with selected fields, or null if not found
 */
export async function getUserById(userId: number) {
  const result = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      currentSessionId: users.currentSessionId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Creates a password reset token for a user.
 *
 * @param userId - The user's database ID
 * @param token - The generated reset token
 * @returns The created token record
 */
export async function createPasswordResetToken(userId: number, token: string) {
  const result = await db
    .insert(passwordResetTokens)
    .values({
      userId,
      token,
    })
    .returning({
      id: passwordResetTokens.id,
      userId: passwordResetTokens.userId,
      token: passwordResetTokens.token,
      createdAt: passwordResetTokens.createdAt,
    });

  return result[0];
}

/**
 * Retrieves a password reset token with its associated user.
 *
 * @param token - The reset token string
 * @returns Token record with user, or undefined if not found
 */
export async function getPasswordResetToken(token: string) {
  const result = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.token, token),
    with: {
      user: true,
    },
  });

  return result;
}

/**
 * Deletes a password reset token after use.
 *
 * @param token - The reset token string to delete
 */
export async function deletePasswordResetToken(token: string) {
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));
}

/**
 * Retrieves words by their editorial status.
 * Includes meanings and notes with user information.
 *
 * @param statuses - Array of statuses to filter by
 * @returns Array of words matching the statuses, ordered by lemma
 */
export async function getWordsByStatus(statuses: string[]) {
  return db.query.words.findMany({
    where: (table, { inArray }) => inArray(table.status, statuses),
    with: {
      notes: {
        with: {
          user: true,
        },
      },
      meanings: {
        orderBy: (meanings, { asc }) => [asc(meanings.number)],
      },
    },
    orderBy: (table, { asc }) => [asc(table.lemma)],
  });
}

/**
 * Retrieves all words with "redacted" status for review.
 */
export async function getRedactedWords() {
  return getWordsByStatus(['redacted']);
}

/**
 * Retrieves all words with "reviewedLex" status.
 */
export async function getReviewedLexWords() {
  return getWordsByStatus(['reviewedLex']);
}

/**
 * Get unique sources from examples for the bibliography dropdown
 */
export async function getUniqueSources() {
  return await db
    .selectDistinct({
      publication: examples.publication,
      author: examples.author,
      year: examples.year,
      city: examples.city,
      editorial: examples.editorial,
      format: examples.format,
    })
    .from(examples)
    .where(isNotNull(examples.publication))
    .orderBy(asc(examples.publication));
}

/**
 * Get words that have examples from a specific publication/source
 */
export async function getWordsBySource(publication: string): Promise<SearchResult[]> {
  // Find all word IDs that have examples with this publication
  const wordIdsResult = await db
    .selectDistinct({ wordId: meanings.wordId })
    .from(examples)
    .innerJoin(meanings, eq(examples.meaningId, meanings.id))
    .where(eq(examples.publication, publication));

  if (wordIdsResult.length === 0) {
    return [];
  }

  const wordIds = wordIdsResult.map((r) => r.wordId);

  // Fetch full word data for these IDs
  const results = await db.query.words.findMany({
    where: sql`${words.id} IN (${sql.join(
      wordIds.map((id) => sql`${id}`),
      sql`, `
    )})`,
    columns: WORD_COLUMNS,
    with: {
      meanings: {
        orderBy: (meaningsTable, { asc }) => [asc(meaningsTable.number)],
        with: {
          examples: true,
        },
      },
    },
    orderBy: (table, { asc }) => [asc(table.lemma)],
  });

  return results.map((result) => dbWordToSearchResult(result));
}
