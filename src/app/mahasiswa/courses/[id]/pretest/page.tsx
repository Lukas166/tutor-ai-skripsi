import { AssessmentPage } from "@/components/assessment/assessment-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AssessmentPage courseId={(await params).id} />;
}
