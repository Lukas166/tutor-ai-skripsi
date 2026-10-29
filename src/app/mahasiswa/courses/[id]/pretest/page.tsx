import { PretestPage } from "@/components/assessment/pretest-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PretestPage courseId={(await params).id} />;
}
