import { StudentProfilePage } from "@/components/assessment/student-profile-page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <StudentProfilePage courseId={(await params).id} />;
}
