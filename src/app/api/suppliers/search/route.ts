import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/suppliers/search
// Real-time server-side search for suppliers by name, code, contact person, phone, email
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";

    const where: any = {
      deletedAt: null,
      isActive: true,
    };

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { contactPerson: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const suppliers = await (prisma.supplier as any).findMany({
      where,
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true,
        code: true,
        name: true,
        contactPerson: true,
        phone: true,
        email: true,
        address: true,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: suppliers,
    });
  } catch (err: any) {
    console.error("GET /api/suppliers/search error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error searching suppliers." },
      { status: 500 }
    );
  }
}
