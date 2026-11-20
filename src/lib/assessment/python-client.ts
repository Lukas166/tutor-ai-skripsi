import { NextRequest, NextResponse } from "next/server";
import { requireMahasiswa } from "@/lib/api-utils";
import prisma from "@/lib/prisma";

type LearningOperation =
  | "practice-current"
  | "practice-accept"
  | "practice-dismiss"
  | "practice-answer"
  | "practice-hint";

export async function assessmentProxy(
  request: NextRequest,
  courseId: string,
  operation: LearningOperation,
  body: Record<string, string | null | undefined> = {},
) {
  const { error, session } = await requireMahasiswa(request);
  if (error) return error;
  const studentId = session!.user.id;
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      isActive: true,
      enrollments: { some: { userId: studentId, isActive: true } },
    },
    select: { id: true },
  });
  if (!course)
    return NextResponse.json(
      { error: "Course tidak ditemukan atau akses tidak tersedia." },
      { status: 403 },
    );
  const token = process.env.RAG_SERVICE_TOKEN;
  if (!token)
    return NextResponse.json(
      { error: "Backend pembelajaran belum dikonfigurasi." },
      { status: 503 },
    );
  try {
    const url = (
      process.env.RAG_SERVICE_URL || "http://127.0.0.1:8001"
    ).replace(/\/$/, "");
    const response = await fetch(`${url}/v1/assessment/${operation}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // Identitas selalu dari sesi server; body browser tidak dapat menentukan mahasiswa lain.
      body: JSON.stringify({ ...body, studentId, courseId }),
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(
          operation.startsWith("practice-") ? 120_000 : 30_000,
        ),
      ]),
    });
    const data = await response.json();
    if (response.status === 404 && data.detail === "Not Found") {
      return NextResponse.json(
        {
          error:
            "Backend AI yang berjalan belum memuat fitur latihan. Jalankan ulang layanan AI, lalu coba lagi.",
        },
        { status: 503 },
      );
    }
    if (!response.ok)
      return NextResponse.json(
        {
          error:
            typeof data.detail === "string"
              ? data.detail
              : "Permintaan latihan tidak valid.",
        },
        { status: response.status },
      );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Backend pembelajaran tidak dapat dihubungi. Coba lagi." },
      { status: 503 },
    );
  }
}
