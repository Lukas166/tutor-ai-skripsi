import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assessmentProxy } from "@/lib/assessment/python-client";
import type { RouteContext } from "@/lib/api-utils";

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
  return assessmentProxy(
    request,
    (await context.params).id,
    "submit",
    parsed.data,
  );
}
