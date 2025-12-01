/**
 * Unit tests for role utilities.
 *
 * @module __tests__/lib/role-utils.test
 */

import { describe, it, expect } from 'vitest';
import {
  getAllowedRoles,
  validateRoleAssignment,
  canManageUser,
  getVisibleRoles,
} from '@/lib/role-utils';

describe('getAllowedRoles', () => {
  it('should return all roles for superadmin', () => {
    const roles = getAllowedRoles('superadmin');
    expect(roles).toEqual(['lexicographer', 'admin', 'superadmin']);
  });

  it('should return lexicographer and admin for admin', () => {
    const roles = getAllowedRoles('admin');
    expect(roles).toEqual(['lexicographer', 'admin']);
  });

  it('should return empty array for lexicographer', () => {
    const roles = getAllowedRoles('lexicographer');
    expect(roles).toEqual([]);
  });

  it('should return empty array for unknown role', () => {
    const roles = getAllowedRoles('unknown');
    expect(roles).toEqual([]);
  });
});

describe('validateRoleAssignment', () => {
  it('should allow superadmin to assign any role', () => {
    expect(validateRoleAssignment('superadmin', 'lexicographer')).toEqual({ valid: true });
    expect(validateRoleAssignment('superadmin', 'admin')).toEqual({ valid: true });
    expect(validateRoleAssignment('superadmin', 'superadmin')).toEqual({ valid: true });
  });

  it('should allow admin to assign lexicographer and admin', () => {
    expect(validateRoleAssignment('admin', 'lexicographer')).toEqual({ valid: true });
    expect(validateRoleAssignment('admin', 'admin')).toEqual({ valid: true });
  });

  it('should not allow admin to assign superadmin', () => {
    const result = validateRoleAssignment('admin', 'superadmin');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('superadmin');
  });

  it('should not allow lexicographer to assign any role', () => {
    expect(validateRoleAssignment('lexicographer', 'lexicographer').valid).toBe(false);
    expect(validateRoleAssignment('lexicographer', 'admin').valid).toBe(false);
    expect(validateRoleAssignment('lexicographer', 'superadmin').valid).toBe(false);
  });
});

describe('canManageUser', () => {
  describe('superadmin permissions', () => {
    it('should allow superadmin to manage lexicographer', () => {
      expect(canManageUser('superadmin', 'lexicographer')).toBe(true);
    });

    it('should allow superadmin to manage admin', () => {
      expect(canManageUser('superadmin', 'admin')).toBe(true);
    });

    it('should allow superadmin to manage superadmin', () => {
      expect(canManageUser('superadmin', 'superadmin')).toBe(true);
    });
  });

  describe('admin permissions', () => {
    it('should allow admin to manage lexicographer', () => {
      expect(canManageUser('admin', 'lexicographer')).toBe(true);
    });

    it('should allow admin to manage admin', () => {
      expect(canManageUser('admin', 'admin')).toBe(true);
    });

    it('should NOT allow admin to manage superadmin', () => {
      expect(canManageUser('admin', 'superadmin')).toBe(false);
    });
  });

  describe('lexicographer permissions', () => {
    it('should NOT allow lexicographer to manage anyone', () => {
      expect(canManageUser('lexicographer', 'lexicographer')).toBe(false);
      expect(canManageUser('lexicographer', 'admin')).toBe(false);
      expect(canManageUser('lexicographer', 'superadmin')).toBe(false);
    });
  });
});

describe('getVisibleRoles', () => {
  it('should return all roles for superadmin', () => {
    const roles = getVisibleRoles('superadmin');
    expect(roles).toEqual(['lexicographer', 'admin', 'superadmin']);
  });

  it('should return lexicographer and admin for admin (no superadmin)', () => {
    const roles = getVisibleRoles('admin');
    expect(roles).toEqual(['lexicographer', 'admin']);
    expect(roles).not.toContain('superadmin');
  });

  it('should return empty array for lexicographer', () => {
    const roles = getVisibleRoles('lexicographer');
    expect(roles).toEqual([]);
  });

  it('should return empty array for unknown role', () => {
    const roles = getVisibleRoles('unknown');
    expect(roles).toEqual([]);
  });
});
