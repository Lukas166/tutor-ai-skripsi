import { AssessmentPage } from "@/components/assessment/assessment-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  return <AssessmentPage courseId={(await params).id} autoStart={(await searchParams).start === "1"} />;
}
