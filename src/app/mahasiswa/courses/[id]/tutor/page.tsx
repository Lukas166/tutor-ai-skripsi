import { redirect } from "next/navigation";

type MahasiswaTutorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MahasiswaTutorPage({
  params,
}: MahasiswaTutorPageProps) {
  const { id } = await params;

  // Tutor memiliki layout layar penuh sendiri; alias tidak merender ulang panel LMS.
  redirect(`/courses/${id}/tutor`);
}
