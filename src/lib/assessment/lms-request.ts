import { NextRequest, NextResponse } from "next/server";
import { requireMahasiswa } from "@/lib/api-utils";
import prisma from "@/lib/prisma";
import {
  AssessmentError, assessmentComparison, assessmentOverview, assessmentReview,
  currentAssessment, saveAssessmentAnswer, startAssessment, studentProfile,
  submitAssessment,
} from "./lms-service";

type Kind = "PRE" | "POST";
type Operation = "overview" | "current" | "start" | "save" | "submit"
  | "profile" | "review" | "comparison";
type Body = { attemptId?: string; questionId?: string;
  selectedOption?: "A" | "B" | "C" | "D" | null };

export async function lmsAssessmentRequest(
  request: NextRequest, courseId: string, operation: Operation,
  kind: Kind = "PRE", body: Body = {},
) {
  const { error, session } = await requireMahasiswa(request);
  if (error) return error;
  const studentId = session!.user.id;
  const course = await prisma.course.findFirst({
    where: { id: courseId, isActive: true,
      enrollments: { some: { userId: studentId, isActive: true } } },
    select: { id: true },
  });
  if (!course) return NextResponse.json(
    { error: "Course tidak ditemukan atau akses tidak tersedia." }, { status: 403 },
  );
  try {
    let result: unknown;
    switch (operation) {
      case "overview": result = await assessmentOverview(studentId, courseId); break;
      case "current": result = await currentAssessment(studentId, courseId, kind); break;
      case "start": result = await startAssessment(studentId, courseId, kind); break;
      case "save":
        if (!body.attemptId || !body.questionId || body.selectedOption === undefined)
          throw new AssessmentError(400, "Jawaban tidak valid.");
        result = await saveAssessmentAnswer(studentId, courseId, kind,
          body.attemptId, body.questionId, body.selectedOption);
        break;
      case "submit":
        if (!body.attemptId) throw new AssessmentError(400, "Sesi tidak valid.");
        result = await submitAssessment(studentId, courseId, kind, body.attemptId);
        break;
      case "profile": result = await studentProfile(studentId, courseId); break;
      case "review": result = await assessmentReview(studentId, courseId, kind); break;
      case "comparison": result = await assessmentComparison(studentId, courseId); break;
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof AssessmentError)
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    console.error("LMS assessment request failed", cause);
    return NextResponse.json({ error: "Data pembelajaran belum dapat diproses." }, { status: 503 });
  }
}
