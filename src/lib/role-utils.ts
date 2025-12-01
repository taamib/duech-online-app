/**
 * Shared role utilities that can be used in both client and server components
 */

/**
 * Get allowed roles for user creation/update based on current user's role
 */
export function getAllowedRoles(userRole: string): string[] {
  if (userRole === 'superadmin') {
    // Superadmins can assign all types of roles
    return ['lexicographer', 'admin', 'superadmin'];
  } else if (userRole === 'admin') {
    // Admins can only assign lexicographer and admin roles
    return ['lexicographer', 'admin'];
  }
  return [];
}

/**
 * Validate if a role can be assigned by the current user
 */
export function validateRoleAssignment(
  currentUserRole: string,
  targetRole: string
): {
  valid: boolean;
  error?: string;
} {
  const allowedRoles = getAllowedRoles(currentUserRole);

  if (!allowedRoles.includes(targetRole)) {
    return {
      valid: false,
      error: `You are not authorized to assign role '${targetRole}'. Allowed roles: ${allowedRoles.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Check if a user can manage (edit/delete) another user based on role hierarchy.
 * Admins cannot manage superadmins - they shouldn't even see them.
 */
export function canManageUser(currentUserRole: string, targetUserRole: string): boolean {
  const allowedRoles = getAllowedRoles(currentUserRole);
  return allowedRoles.includes(targetUserRole);
}

/**
 * Get roles that should be visible to the current user.
 * Admins should not see superadmins at all.
 */
export function getVisibleRoles(currentUserRole: string): string[] {
  if (currentUserRole === 'superadmin') {
    return ['lexicographer', 'admin', 'superadmin'];
  } else if (currentUserRole === 'admin') {
    return ['lexicographer', 'admin'];
  }
  return [];
}
