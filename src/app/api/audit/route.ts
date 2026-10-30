import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/audit
// Retrieves live audit events from PostgreSQL database
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const hasAuditAccess =
    (await checkSessionPermission(session, "auditController", "view")) ||
    (await checkSessionPermission(session, "accessControl", "view"));

  if (!hasAuditAccess) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to view audit logs." },
      { status: 403 }
    );
  }

  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const mapped = logs.map((l) => {
      let targetDesc = l.resource || "System";
      if (l.details && typeof l.details === "object") {
        const d = l.details as Record<string, any>;
        if (d.name) {
          targetDesc = `${d.name} (${l.resource || "record"})`;
        } else if (d.email) {
          targetDesc = `${d.email} (${l.resource || "user"})`;
        }
      } else if (l.resourceId) {
        targetDesc = `${l.resource} #${l.resourceId.slice(-6)}`;
      }

      const formattedDate = new Date(l.createdAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      return {
        id: l.id,
        user: l.user?.name || l.user?.email || "System Security",
        action: l.action.replace(/_/g, " "),
        target: targetDesc,
        timestamp: formattedDate,
        ipAddress: l.ipAddress || "127.0.0.1",
      };
    });

    return NextResponse.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    console.error("GET /api/audit error:", err);
    return NextResponse.json({
      success: false,
      error: "Could not retrieve audit records.",
      data: [],
    });
  }
}
