import { prisma } from "@/lib/prisma";

interface LogParams {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  req?: Request;
}

export async function logAuditEvent({
  userId,
  action,
  resource,
  resourceId,
  details,
  req,
}: LogParams) {
  try {
    const ipAddress =
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req?.headers.get("x-real-ip") ??
      "127.0.0.1";
    const userAgent = req?.headers.get("user-agent") ?? undefined;

    // Check if user exists in database before associating foreign key
    let validUserId: string | undefined = undefined;
    if (userId && userId !== "demo-user") {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (userExists) {
        validUserId = userExists.id;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: validUserId,
        action,
        resource,
        resourceId: resourceId ?? undefined,
        details: details ? JSON.parse(JSON.stringify(details)) : undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (err) {
    console.error("Failed to create audit log entry:", err);
  }
}
