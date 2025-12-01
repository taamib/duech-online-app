/**
 * Unit tests for server actions.
 *
 * @module __tests__/lib/actions.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  fetchUniqueSources,
  fetchWordsBySource,
} from '@/lib/actions';
import { createMockUser, createMockSessionUser } from '@/__tests__/utils/test-helpers';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/role-utils', () => ({
  validateRoleAssignment: vi.fn(),
  canManageUser: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  hashPassword: vi.fn(),
  createPasswordResetToken: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  getUniqueSources: vi.fn(),
  getWordsBySource: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import * as auth from '@/lib/auth';
import * as roleUtils from '@/lib/role-utils';
import * as queries from '@/lib/queries';
import * as email from '@/lib/email';

describe('createUserAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if not authenticated', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(null);

    const result = await createUserAction('newuser', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized: No session found');
  });

  it('should fail if user is not admin', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ role: 'lexicographer' })
    );

    const result = await createUserAction('newuser', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized: Admin or superadmin role required');
  });

  it('should fail for invalid role assignment', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({
      valid: false,
      error: 'Cannot assign superadmin role',
    });

    const result = await createUserAction('newuser', 'new@example.com', 'superadmin');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot assign superadmin role');
  });

  it('should fail for username too short', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });

    const result = await createUserAction('ab', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Username must be at least 3 characters long');
  });

  it('should fail for invalid email', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });

    const result = await createUserAction('newuser', 'invalid-email', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid email address');
  });

  it('should fail if username already exists', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.getUserByUsername).mockResolvedValue(createMockUser());

    const result = await createUserAction('existinguser', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Username already exists');
  });

  it('should fail if email already exists', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.getUserByUsername).mockResolvedValue(null);
    vi.mocked(queries.getUserByEmail).mockResolvedValue(createMockUser());

    const result = await createUserAction('newuser', 'existing@example.com', 'lexicographer');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email already exists');
  });

  it('should create user successfully', async () => {
    const mockNewUser = createMockUser({
      id: 10,
      username: 'newuser',
      email: 'new@example.com',
      role: 'lexicographer',
    });
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.getUserByUsername).mockResolvedValue(null);
    vi.mocked(queries.getUserByEmail).mockResolvedValue(null);
    vi.mocked(queries.hashPassword).mockResolvedValue('hashed-password');
    vi.mocked(queries.createUser).mockResolvedValue(mockNewUser);
    vi.mocked(queries.createPasswordResetToken).mockResolvedValue(undefined);
    vi.mocked(email.sendWelcomeEmail).mockResolvedValue(undefined);

    const result = await createUserAction('newuser', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('newuser');
    expect(result.user?.email).toBe('new@example.com');
    expect(result.generatedPassword).toBeDefined();
    expect(queries.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'newuser',
        email: 'new@example.com',
        role: 'lexicographer',
      })
    );
  });

  it('should still succeed even if welcome email fails', async () => {
    const mockNewUser = createMockUser();
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.getUserByUsername).mockResolvedValue(null);
    vi.mocked(queries.getUserByEmail).mockResolvedValue(null);
    vi.mocked(queries.hashPassword).mockResolvedValue('hashed-password');
    vi.mocked(queries.createUser).mockResolvedValue(mockNewUser);
    vi.mocked(queries.createPasswordResetToken).mockRejectedValue(new Error('Token error'));

    const result = await createUserAction('newuser', 'new@example.com', 'lexicographer');

    expect(result.success).toBe(true);
  });
});

describe('updateUserAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if not authenticated', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(null);

    const result = await updateUserAction(1, { username: 'newname' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized: No session found');
  });

  it('should fail for invalid role assignment', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({
      valid: false,
      error: 'Cannot assign superadmin role',
    });

    const result = await updateUserAction(1, { role: 'superadmin' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot assign superadmin role');
  });

  it('should fail if new username already exists', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserByUsername).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await updateUserAction(1, { username: 'existinguser' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Username already exists');
  });

  it('should fail if new email already exists', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserByUsername).mockResolvedValue(null);
    vi.mocked(queries.getUserByEmail).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await updateUserAction(1, { email: 'existing@example.com' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email already exists');
  });

  it('should allow keeping same username', async () => {
    const mockUser = createMockUser({ id: 1, username: 'testuser' });
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(queries.updateUser).mockResolvedValue(mockUser);

    const result = await updateUserAction(1, { username: 'testuser' });

    expect(result.success).toBe(true);
  });

  it('should update user successfully', async () => {
    const mockUpdatedUser = createMockUser({
      id: 1,
      username: 'updatedname',
      email: 'updated@example.com',
    });
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.getUserByUsername).mockResolvedValue(null);
    vi.mocked(queries.getUserByEmail).mockResolvedValue(null);
    vi.mocked(queries.updateUser).mockResolvedValue(mockUpdatedUser);

    const result = await updateUserAction(1, {
      username: 'updatedname',
      email: 'updated@example.com',
      role: 'lexicographer',
    });

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('updatedname');
    expect(queries.updateUser).toHaveBeenCalledWith(1, {
      username: 'updatedname',
      email: 'updated@example.com',
      role: 'lexicographer',
    });
  });
});

describe('deleteUserAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if not authenticated', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(null);

    const result = await deleteUserAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized: No session found');
  });

  it('should fail when trying to delete own account', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );

    const result = await deleteUserAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot delete your own account');
  });

  it('should fail if target user not found', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(null);

    const result = await deleteUserAction(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });

  it('should fail when admin tries to delete superadmin', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(createMockUser({ id: 2, role: 'superadmin' }));
    vi.mocked(roleUtils.canManageUser).mockReturnValue(false);

    const result = await deleteUserAction(2);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No tienes permisos para eliminar este usuario');
    expect(queries.deleteUser).not.toHaveBeenCalled();
  });

  it('should allow superadmin to delete admin', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'superadmin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(createMockUser({ id: 2, role: 'admin' }));
    vi.mocked(roleUtils.canManageUser).mockReturnValue(true);
    vi.mocked(queries.deleteUser).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await deleteUserAction(2);

    expect(result.success).toBe(true);
    expect(queries.deleteUser).toHaveBeenCalledWith(2);
  });

  it('should allow superadmin to delete superadmin', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'superadmin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(createMockUser({ id: 2, role: 'superadmin' }));
    vi.mocked(roleUtils.canManageUser).mockReturnValue(true);
    vi.mocked(queries.deleteUser).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await deleteUserAction(2);

    expect(result.success).toBe(true);
    expect(queries.deleteUser).toHaveBeenCalledWith(2);
  });

  it('should allow admin to delete lexicographer', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(
      createMockUser({ id: 2, role: 'lexicographer' })
    );
    vi.mocked(roleUtils.canManageUser).mockReturnValue(true);
    vi.mocked(queries.deleteUser).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await deleteUserAction(2);

    expect(result.success).toBe(true);
    expect(queries.deleteUser).toHaveBeenCalledWith(2);
  });

  it('should delete user successfully', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(
      createMockUser({ id: 2, role: 'lexicographer' })
    );
    vi.mocked(roleUtils.canManageUser).mockReturnValue(true);
    vi.mocked(queries.deleteUser).mockResolvedValue(createMockUser({ id: 2 }));

    const result = await deleteUserAction(2);

    expect(result.success).toBe(true);
    expect(queries.deleteUser).toHaveBeenCalledWith(2);
  });

  it('should handle database errors', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(
      createMockUser({ id: 2, role: 'lexicographer' })
    );
    vi.mocked(roleUtils.canManageUser).mockReturnValue(true);
    vi.mocked(queries.deleteUser).mockRejectedValue(new Error('Database error'));

    const result = await deleteUserAction(2);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database error');
  });
});

describe('resetUserPasswordAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fail if not authenticated', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(null);

    const result = await resetUserPasswordAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized: No session found');
  });

  it('should fail if user not found', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserById).mockResolvedValue(null);

    const result = await resetUserPasswordAction(999);

    expect(result.success).toBe(false);
    expect(result.error).toBe('User not found');
  });

  it('should fail for invalid role hierarchy', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserById).mockResolvedValue(createMockUser({ role: 'superadmin' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({
      valid: false,
      error: 'Cannot manage superadmin',
    });

    const result = await resetUserPasswordAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No tienes permisos para restablecer la contraseña de este usuario');
  });

  it('should fail if user has no email', async () => {
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserById).mockResolvedValue(createMockUser({ email: '' }));
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.createPasswordResetToken).mockResolvedValue(undefined);

    const result = await resetUserPasswordAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('El usuario no tiene un correo electrónico configurado');
  });

  it('should send password reset email successfully', async () => {
    const mockUser = createMockUser({ id: 2, email: 'user@example.com' });
    vi.mocked(auth.getSessionUser).mockResolvedValue(
      createMockSessionUser({ id: '1', role: 'admin' })
    );
    vi.mocked(queries.getUserById).mockResolvedValue(mockUser);
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.createPasswordResetToken).mockResolvedValue(undefined);
    vi.mocked(email.sendPasswordResetEmail).mockResolvedValue(undefined);

    const result = await resetUserPasswordAction(2);

    expect(result.success).toBe(true);
    expect(queries.createPasswordResetToken).toHaveBeenCalledWith(2, expect.any(String));
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      mockUser.username,
      expect.any(String)
    );
  });

  it('should fail if email sending fails', async () => {
    const mockUser = createMockUser({ email: 'user@example.com' });
    vi.mocked(auth.getSessionUser).mockResolvedValue(createMockSessionUser({ role: 'admin' }));
    vi.mocked(queries.getUserById).mockResolvedValue(mockUser);
    vi.mocked(roleUtils.validateRoleAssignment).mockReturnValue({ valid: true });
    vi.mocked(queries.createPasswordResetToken).mockResolvedValue(undefined);
    vi.mocked(email.sendPasswordResetEmail).mockRejectedValue(new Error('Email failed'));

    const result = await resetUserPasswordAction(1);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error al enviar el correo de restablecimiento');
  });
});

describe('fetchUniqueSources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return sources successfully', async () => {
    const mockSources = [
      { publication: 'Source 1', author: 'Author 1' },
      { publication: 'Source 2', author: 'Author 2' },
    ];
    vi.mocked(queries.getUniqueSources).mockResolvedValue(mockSources as never);

    const result = await fetchUniqueSources();

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockSources);
  });

  it('should handle errors', async () => {
    vi.mocked(queries.getUniqueSources).mockRejectedValue(new Error('Database error'));

    const result = await fetchUniqueSources();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error al cargar las fuentes');
  });
});

describe('fetchWordsBySource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return words successfully', async () => {
    const mockWords = [{ lemma: 'word1' }, { lemma: 'word2' }];
    vi.mocked(queries.getWordsBySource).mockResolvedValue(mockWords as never);

    const result = await fetchWordsBySource('Test Publication');

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockWords);
    expect(queries.getWordsBySource).toHaveBeenCalledWith('Test Publication');
  });

  it('should handle errors', async () => {
    vi.mocked(queries.getWordsBySource).mockRejectedValue(new Error('Database error'));

    const result = await fetchWordsBySource('Test Publication');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Error al cargar las palabras');
  });
});
