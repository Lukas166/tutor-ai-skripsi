import { LearningResults } from "@/components/assessment/learning-results";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <LearningResults courseId={(await params).id} />;
}
