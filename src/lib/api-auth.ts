/**
 * API authentication helpers for protected API routes.
 *
 * Provides functions to verify authentication and authorization
 * in Next.js API route handlers.
 *
 * @module lib/api-auth
 */

import { NextResponse } from 'next/server';
import { getSessionUser, type SessionUser } from '@/lib/auth';
export { validateRoleAssignment, canManageUser } from '@/lib/role-utils';

/**
 * Verifies the user is authenticated and has admin/superadmin role.
 * Throws a NextResponse error if not authorized.
 *
 * @returns The authenticated session user
 * @throws NextResponse with 401 if not authenticated, 403 if not admin
 */
export async function requireAdminForApi(): Promise<SessionUser> {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
    throw NextResponse.json({ error: 'Forbidden: Admin role required' }, { status: 403 });
  }

  return currentUser;
}

/**
 * Parses and validates a user ID from route parameters.
 *
 * @param params - Route params promise containing the id
 * @returns Object with userId or error response
 * @internal
 */
async function parseUserIdFromParams(params: Promise<{ id: string }>): Promise<{
  userId?: number;
  error?: NextResponse;
}> {
  const { id } = await params;
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    return {
      error: NextResponse.json({ error: 'Invalid user ID' }, { status: 400 }),
    };
  }

  return { userId };
}

/**
 * Common setup for user management API routes.
 * Verifies admin authorization and parses the user ID from params.
 *
 * @param params - Route params promise containing the id
 * @returns Object with currentUser and userId, or error response
 */
export async function setupUserApiRoute(params: Promise<{ id: string }>): Promise<{
  currentUser?: SessionUser;
  userId?: number;
  error?: NextResponse;
}> {
  try {
    const currentUser = await requireAdminForApi();
    const { userId, error } = await parseUserIdFromParams(params);

    if (error) {
      return { error };
    }

    return { currentUser, userId };
  } catch (err) {
    // requireAdminForApi throws NextResponse errors
    return { error: err as NextResponse };
  }
}
