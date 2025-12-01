import { NextRequest, NextResponse } from 'next/server';
import { validateRoleAssignment, setupUserApiRoute, canManageUser } from '@/lib/api-auth';
import { updateUser, deleteUser, getUserById } from '@/lib/queries';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { currentUser, userId, error } = await setupUserApiRoute(params);
    if (error) return error;

    // Parse request body
    const body = await request.json();
    const { username, email, role } = body;

    // Validate input
    const updateData: {
      username?: string;
      email?: string;
      role?: string;
    } = {};

    if (username !== undefined) {
      if (username.trim().length < 3) {
        return NextResponse.json(
          { error: 'Username must be at least 3 characters long' },
          { status: 400 }
        );
      }
      updateData.username = username.trim();
    }

    if (email !== undefined) {
      if (!email.includes('@')) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }
      updateData.email = email.trim().toLowerCase();
    }

    if (role !== undefined && currentUser) {
      // Validate role assignment
      const validation = validateRoleAssignment(currentUser.role!, role);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 403 });
      }
      updateData.role = role;
    }

    // Update user
    const updatedUser = await updateUser(userId!, updateData);

    return NextResponse.json({
      success: true,
      data: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { currentUser, userId, error } = await setupUserApiRoute(params);
    if (error) return error;

    // Prevent self-deletion
    if (currentUser && String(currentUser.id) === String(userId)) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Get target user to check role hierarchy
    const targetUser = await getUserById(userId!);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate role hierarchy - admins cannot delete superadmins
    if (currentUser && targetUser.role && !canManageUser(currentUser.role!, targetUser.role)) {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar este usuario' },
        { status: 403 }
      );
    }

    // Delete user
    const deletedUser = await deleteUser(userId!);

    return NextResponse.json({
      success: true,
      data: deletedUser,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, error } = await setupUserApiRoute(params);
    if (error) return error;

    // Get user
    const user = await getUserById(userId!);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
