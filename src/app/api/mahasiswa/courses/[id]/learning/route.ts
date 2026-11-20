import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assessmentProxy } from "@/lib/assessment/python-client";
import { lmsAssessmentRequest } from "@/lib/assessment/lms-request";
import { requireMahasiswa, type RouteContext } from "@/lib/api-utils";
import { ensurePracticeFollowup, preparePracticeFollowup } from "@/lib/tutor-ai/service";

const schema = z
  .object({
    operation: z.enum([
      "practice-current",
      "practice-accept",
      "practice-dismiss",
      "practice-answer",
      "practice-hint",
    ]),
    practiceId: z.string().uuid(),
    requestId: z.string().uuid().optional(),
    selectedOption: z.enum(["A", "B", "C", "D"]).optional(),
  })
  .strict();

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Permintaan latihan tidak valid." },
      { status: 400 },
    );
  const { operation, ...body } = parsed.data;
  const courseId = (await context.params).id;
  const response = await assessmentProxy(request, courseId, operation, body);
  if (response.ok && operation === "practice-answer" && body.requestId) {
    const { session } = await requireMahasiswa(request);
    if (session) {
      const studentId = session.user.id;
      const followupInput = {
        courseId, userId: studentId, practiceId: body.practiceId,
        requestId: body.requestId,
      };
      const pending = await ensurePracticeFollowup(followupInput).catch((error) => {
        console.error("Tutor practice follow-up could not be queued", error);
        return null;
      });
      after(async () => {
        try {
          const item = pending ?? await ensurePracticeFollowup(followupInput);
          if (item) await preparePracticeFollowup(courseId, studentId, item.eventId);
        } catch (error) {
          console.error("Tutor practice follow-up generation failed", error);
        }
      });
    }
  }
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  return lmsAssessmentRequest(request, (await context.params).id, "comparison");
}
