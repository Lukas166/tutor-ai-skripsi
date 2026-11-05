import type { ReactNode } from "react";
import { ASSESSMENT_DURATION_SECONDS } from "@/lib/assessment/timer";

export function AssessmentGuide({
  kind,
  questionCount,
  inProgress = false,
  action,
}: {
  kind: "pretest" | "posttest";
  questionCount: number;
  inProgress?: boolean;
  action: ReactNode;
}) {
  const label = kind === "pretest" ? "pre-test" : "post-test";

  return (
    <section className="max-w-3xl space-y-8">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Sebelum mulai</h2>
        <p className="leading-relaxed text-muted-foreground">
          {kind === "pretest"
            ? "Tes ini membantu mengenali pemahaman awal Anda. Kerjakan sesuai kemampuan sendiri; hasilnya akan membantu menentukan materi yang perlu dipelajari."
            : "Gunakan kesempatan ini untuk melihat perkembangan setelah belajar. Kerjakan sesuai pemahaman Anda saat ini."}
        </p>
      </div>

      <div>
        <h3 className="font-medium">Yang perlu Anda ketahui</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground marker:text-foreground">
          <li>
            Ada <span className="font-medium text-foreground">{questionCount} soal</span>, masing-masing dengan empat pilihan jawaban (A–D).
          </li>
          <li>
            Waktu pengerjaan <span className="font-medium text-foreground">{ASSESSMENT_DURATION_SECONDS / 60} menit</span> sejak Anda menekan tombol mulai. Waktu tetap berjalan jika halaman ditutup atau dimuat ulang.
          </li>
          <li>Anda dapat berpindah soal dan mengubah pilihan selama waktu masih tersedia. Jawaban disimpan otomatis.</li>
          <li>Jawaban tidak dapat diubah setelah dikirim. Saat waktu habis, hasil dikirim otomatis saat halaman terbuka atau ketika Anda kembali; soal yang kosong dihitung salah.</li>
          {kind === "pretest" && (
            <li>Profil Belajar dan AI Tutor tersedia setelah pre-test dikirim.</li>
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="font-medium">
          {inProgress ? `Sesi ${label} Anda sudah dimulai. Buka kembali untuk melanjutkan atau melihat hasilnya.` : `Sudah siap? Mari kita mulai ${label}.`}
        </p>
        {action}
      </div>
    </section>
  );
}
