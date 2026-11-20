import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lmsAssessmentRequest } from "@/lib/assessment/lms-request";
import type { RouteContext } from "@/lib/api-utils";

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = z
    .object({ attemptId: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 400 });
  return lmsAssessmentRequest(request, (await context.params).id, "submit", "POST", parsed.data);
}
