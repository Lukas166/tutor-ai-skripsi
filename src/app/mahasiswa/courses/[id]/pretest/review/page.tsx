import { AssessmentReviewPage } from "@/components/assessment/assessment-review-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AssessmentReviewPage courseId={(await params).id} kind="pretest" />;
}
