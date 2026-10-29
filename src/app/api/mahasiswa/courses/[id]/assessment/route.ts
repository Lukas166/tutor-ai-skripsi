import { NextRequest } from "next/server";
import { assessmentProxy } from "@/lib/assessment/python-client";
import type { RouteContext } from "@/lib/api-utils";

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return assessmentProxy(request, id, "overview");
}
