import { NextRequest } from "next/server";
import { lmsAssessmentRequest } from "@/lib/assessment/lms-request";
import type { RouteContext } from "@/lib/api-utils";

export async function GET(request: NextRequest, context: RouteContext) {
  return lmsAssessmentRequest(request, (await context.params).id, "profile");
}
