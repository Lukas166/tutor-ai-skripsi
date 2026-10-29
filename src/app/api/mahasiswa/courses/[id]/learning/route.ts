import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assessmentProxy } from "@/lib/assessment/python-client";
import type { RouteContext } from "@/lib/api-utils";

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
    selectedOption: z.enum(["A", "B", "C", "D", "E"]).optional(),
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
  return assessmentProxy(request, (await context.params).id, operation, body);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return assessmentProxy(request, (await context.params).id, "comparison");
}
