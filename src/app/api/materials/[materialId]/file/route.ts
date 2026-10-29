import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { downloadMaterialFileFromSupabase } from "@/lib/supabase-storage";

type FileRouteContext = {
  params: Promise<{ materialId: string }>;
};

export async function GET(request: NextRequest, context: FileRouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { materialId } = await context.params;
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: {
      materialType: true,
      storagePath: true,
      fileName: true,
      isActive: true,
      courseSession: {
        select: {
          isActive: true,
          course: { select: { id: true, isActive: true } },
        },
      },
    },
  });

  if (material?.materialType !== "file" || !material.storagePath) {
    return NextResponse.json({ error: "Materi tidak ditemukan" }, { status: 404 });
  }

  const role = (session.user as { role?: string }).role;
  const course = material.courseSession.course;
  let allowed = role === "admin";

  if (role === "dosen") {
    const instructor = await prisma.courseInstructor.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
      select: { id: true },
    });
    allowed = Boolean(instructor);
  }

  if (role === "mahasiswa" && material.isActive && material.courseSession.isActive && course.isActive) {
    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: session.user.id } },
      select: { isActive: true },
    });
    allowed = enrollment?.isActive === true;
  }

  if (!allowed) {
    return NextResponse.json({ error: "Materi tidak ditemukan" }, { status: 404 });
  }

  try {
    const file = await downloadMaterialFileFromSupabase(material.storagePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="material.pdf"; filename*=UTF-8''${encodeURIComponent(material.fileName)}`,
        "Content-Length": String(file.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Gagal membaca materi dari Supabase Storage:", error);
    return NextResponse.json({ error: "Gagal membaca file materi" }, { status: 502 });
  }
}
