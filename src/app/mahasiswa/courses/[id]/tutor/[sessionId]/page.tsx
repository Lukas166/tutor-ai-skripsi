import { redirect } from "next/navigation";

type MahasiswaTutorSessionPageProps = {
  params: Promise<{ id: string; sessionId: string }>;
};

export default async function MahasiswaTutorSessionPage({
  params,
}: MahasiswaTutorSessionPageProps) {
  const { id, sessionId } = await params;

  // ID chat dipertahankan ketika tautan lama diarahkan ke layout tutor utama.
  redirect(`/courses/${id}/tutor/${sessionId}`);
}
