import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lmsAssessmentRequest } from "@/lib/assessment/lms-request";
import type { RouteContext } from "@/lib/api-utils";
import { requireMahasiswa } from "@/lib/api-utils";
import { ensureTutorWelcomeSession, prepareTutorWelcome } from "@/lib/tutor-ai/service";

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = z
    .object({ attemptId: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "ID sesi tidak valid." },
      { status: 400 },
    );
  const courseId = (await context.params).id;
  const response = await lmsAssessmentRequest(
    request,
    courseId,
    "submit",
    "PRE",
    parsed.data,
  );
  if (response.ok) {
    const { session } = await requireMahasiswa(request);
    if (session) {
      // Hanya pembuatan chat/pesan pending yang ditunggu; generasi LLM berjalan sesudah respons.
      await ensureTutorWelcomeSession(courseId, session.user.id).catch((error) =>
        console.error("Tutor welcome session could not be created", error));
      after(async () => {
        await prepareTutorWelcome(courseId, session.user.id).catch((error) =>
          console.error("Tutor welcome generation failed", error));
      });
    }
  }
  return response;
}
