import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assessmentProxy } from "@/lib/assessment/python-client";
import type { RouteContext } from "@/lib/api-utils";

const draftSchema = z
  .object({
    attemptId: z.string().uuid(),
    questionId: z.string().min(1),
    selectedOption: z.enum(["A", "B", "C", "D", "E"]),
  })
  .strict();

export async function GET(request: NextRequest, context: RouteContext) {
  return assessmentProxy(request, (await context.params).id, "current");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return assessmentProxy(request, (await context.params).id, "start");
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Sesi, soal, dan pilihan A–E wajib valid." },
      { status: 400 },
    );
  return assessmentProxy(
    request,
    (await context.params).id,
    "save",
    parsed.data,
  );
}
