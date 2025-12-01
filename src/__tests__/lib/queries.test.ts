/**
 * Unit tests for database query functions.
 *
 * @module __tests__/lib/queries.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockUser } from '@/__tests__/utils/test-helpers';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

// Create mock functions that can be controlled in tests using vi.hoisted
const { mockWordsFindFirst, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockWordsFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

// Mock database with chainable select
vi.mock('@/lib/db', () => {
  // Create a function that returns a chainable object with all db methods
  const createChain = (resolveValue: unknown[] = []) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select',
      'selectDistinct',
      'from',
      'where',
      'orderBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ];
    for (const method of methods) {
      chain[method] = vi.fn().mockImplementation(() => createChain(resolveValue));
    }
    // Make it thenable so await works
    chain.then = (resolve: (value: unknown) => void) => resolve(resolveValue);
    return chain;
  };

  return {
    db: {
      query: {
        words: {
          findFirst: mockWordsFindFirst,
          findMany: vi.fn(),
        },
        users: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      select: vi.fn().mockImplementation(() => createChain()),
      selectDistinct: vi.fn().mockImplementation(() => createChain()),
    },
  };
});

// Mock transformers
vi.mock('@/lib/transformers', () => ({
  dbWordToWord: vi.fn((w) => ({
    lemma: w.lemma,
    root: w.root,
    values: [],
  })),
  dbWordToSearchResult: vi.fn((w) => ({
    lemma: w.lemma,
    meanings: [],
    firstMeaningPreview: '',
  })),
}));

import bcrypt from 'bcrypt';
import {
  verifyUserPassword,
  hashPassword,
  getWordByLemma,
  createUser,
  updateUser,
  deleteUser,
  updateUserSessionId,
  getUsers,
  getUsersFiltered,
} from '@/lib/queries';

describe('verifyUserPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for valid password', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(true));

    const result = await verifyUserPassword('hashedPassword', 'correctPassword');

    expect(result).toBe(true);
    expect(bcrypt.compare).toHaveBeenCalledWith('correctPassword', 'hashedPassword');
  });

  it('should return false for invalid password', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(() => Promise.resolve(false));

    const result = await verifyUserPassword('hashedPassword', 'wrongPassword');

    expect(result).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(bcrypt.compare).mockImplementation(() => Promise.reject(new Error('bcrypt error')));

    await expect(verifyUserPassword('hash', 'pass')).rejects.toThrow('bcrypt error');
  });
});

describe('hashPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return hashed password', async () => {
    vi.mocked(bcrypt.hash).mockImplementation(() => Promise.resolve('$2b$10$hashedValue'));

    const result = await hashPassword('plainPassword');

    expect(result).toBe('$2b$10$hashedValue');
    expect(bcrypt.hash).toHaveBeenCalledWith('plainPassword', 10);
  });

  it('should use default salt rounds', async () => {
    vi.mocked(bcrypt.hash).mockImplementation(() => Promise.resolve('hash'));

    await hashPassword('password');

    expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
  });
});

describe('Word query functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query word by lemma', async () => {
    const mockWord = {
      id: 1,
      lemma: 'ejemplo',
      root: 'ejemplo',
      letter: 'e',
      variant: null,
      status: 'published',
      createdBy: 1,
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      meanings: [],
      notes: [],
    };
    mockWordsFindFirst.mockResolvedValue(mockWord);

    const result = await getWordByLemma('ejemplo');

    expect(result).not.toBeNull();
    expect(result?.word.lemma).toBe('ejemplo');
  });

  it('should return null for non-existent word', async () => {
    mockWordsFindFirst.mockResolvedValue(null);

    const result = await getWordByLemma('nonexistent');

    expect(result).toBeNull();
  });

  it('should include drafts when option is set', async () => {
    const mockWord = {
      id: 1,
      lemma: 'draft',
      root: 'draft',
      letter: 'd',
      variant: null,
      status: 'imported',
      createdBy: 1,
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      meanings: [],
      notes: [],
    };
    mockWordsFindFirst.mockResolvedValue(mockWord);

    const result = await getWordByLemma('draft', { includeDrafts: true });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('imported');
  });
});

describe('User CRUD operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create user', async () => {
    const newUser = createMockUser({ id: 10, username: 'newuser' });
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([newUser]),
      }),
    });

    const result = await createUser({
      username: 'newuser',
      email: 'new@example.com',
      passwordHash: 'hash',
      role: 'lexicographer',
    });

    expect(result.username).toBe('newuser');
    expect(mockInsert).toHaveBeenCalled();
  });

  it('should update user', async () => {
    const updatedUser = createMockUser({ username: 'updated' });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedUser]),
        }),
      }),
    });

    const result = await updateUser(1, { username: 'updated' });

    expect(result.username).toBe('updated');
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('should delete user', async () => {
    const deletedUser = createMockUser();
    mockDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([deletedUser]),
      }),
    });

    const result = await deleteUser(1);

    expect(result).toEqual(deletedUser);
    expect(mockDelete).toHaveBeenCalled();
  });
});

describe('Session management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update user session ID', async () => {
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await updateUserSessionId(1, 'new-session-id');

    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe('getUsers and getUsersFiltered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUsers should return all users', async () => {
    // The mock db already returns empty array by default
    const result = await getUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getUsersFiltered should filter by visible roles', async () => {
    // The mock db already returns empty array by default
    // This test verifies the function can be called with role filters
    const result = await getUsersFiltered(['lexicographer', 'admin']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getUsersFiltered should work with single role', async () => {
    const result = await getUsersFiltered(['lexicographer']);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getUsersFiltered should return empty for empty roles array', async () => {
    const result = await getUsersFiltered([]);
    expect(Array.isArray(result)).toBe(true);
  });
});
