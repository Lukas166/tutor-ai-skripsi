import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assessmentProxy } from "@/lib/assessment/python-client";
import type { RouteContext } from "@/lib/api-utils";

export async function GET(request: NextRequest, context: RouteContext) {
  return assessmentProxy(request, (await context.params).id, "current", {
    kind: "POST",
  });
}
export async function POST(request: NextRequest, context: RouteContext) {
  return assessmentProxy(request, (await context.params).id, "start", {
    kind: "POST",
  });
}
export async function PATCH(request: NextRequest, context: RouteContext) {
  const parsed = z
    .object({
      attemptId: z.string().uuid(),
      questionId: z.string().min(1),
      selectedOption: z.enum(["A", "B", "C", "D", "E"]),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Jawaban tidak valid." },
      { status: 400 },
    );
  return assessmentProxy(request, (await context.params).id, "save", {
    ...parsed.data,
    kind: "POST",
  });
}
