import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lmsAssessmentRequest } from "@/lib/assessment/lms-request";
import type { RouteContext } from "@/lib/api-utils";

export async function GET(request: NextRequest, context: RouteContext) {
  return lmsAssessmentRequest(request, (await context.params).id, "current", "POST");
}
export async function POST(request: NextRequest, context: RouteContext) {
  return lmsAssessmentRequest(request, (await context.params).id, "start", "POST");
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  const parsed = z
    .object({
      attemptId: z.string().uuid(),
      questionId: z.string().min(1),
      selectedOption: z.enum(["A", "B", "C", "D"]).nullable(),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Jawaban tidak valid." },
      { status: 400 },
    );
  return lmsAssessmentRequest(request, (await context.params).id, "save", "POST", parsed.data);
}
