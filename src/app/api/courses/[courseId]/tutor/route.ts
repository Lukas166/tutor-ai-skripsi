import { after, NextRequest, NextResponse } from "next/server";
import { getTutorOverview, prepareTutorWelcome } from "@/lib/tutor-ai/service";
import { requireTutorUser, tutorErrorResponse } from "@/lib/tutor-ai/route-helpers";

type TutorRouteContext = {
  params: Promise<{ courseId: string }>;
};

export async function GET(request: NextRequest, context: TutorRouteContext) {
  const { userId, error } = await requireTutorUser(request);
  if (error) return error;

  const { courseId } = await context.params;

  try {
    const overview = await getTutorOverview(courseId, userId!);
    if (overview.welcomePending) after(async () => {
      await prepareTutorWelcome(courseId, userId!).catch((error) =>
        console.error("Tutor welcome generation failed", error));
    });
    return NextResponse.json(overview);
  } catch (err) {
    return tutorErrorResponse(err, "Gagal memuat Tutor AI");
  }
}
