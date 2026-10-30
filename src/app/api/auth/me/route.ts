import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserEffectivePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const permissions = await getUserEffectivePermissions(session.userId);

  let customPermissions: any = null;
  let hasCustomPermissions = false;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { permissions: true },
    });
    if (dbUser?.permissions && Object.keys(dbUser.permissions as object).length > 0) {
      customPermissions = dbUser.permissions;
      hasCustomPermissions = true;
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      roles: session.roles,
      permissions,
      customPermissions,
      hasCustomPermissions,
    },
  });
}
