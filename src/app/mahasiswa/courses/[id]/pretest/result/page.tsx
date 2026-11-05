import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  redirect(`/mahasiswa/courses/${(await params).id}/student-profile`);
}
