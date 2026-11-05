"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { assessmentRequest, type AssessmentOverview } from "./types";

export function CourseAssessmentCard({ courseId }: { courseId: string }) {
  const [overview, setOverview] = useState<AssessmentOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    assessmentRequest<AssessmentOverview>(
      `/api/mahasiswa/courses/${courseId}/assessment`,
    )
      .then((data) => {
        if (active) {
          setOverview(data);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId, retryCount]);

  if (!loading && !error && !overview?.available) return null;

  const finished = overview?.status === "SUBMITTED";
  const inProgress = overview?.status === "IN_PROGRESS";
  return (
    <Card className="gap-0 border-border/70 py-0 shadow-sm">
      <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:gap-8 md:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand text-black">
            <ClipboardList className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">
              {finished ? "Belajar dari hasil pre-test" : "Pre-test"}
            </h2>
            {loading ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Memuat…
              </p>
            ) : error ? (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {finished
                  ? "Lihat materi prioritas atau lanjutkan bersama AI Tutor."
                  : inProgress
                    ? "Lanjutkan soal yang belum selesai."
                    : "Kenali pemahaman awal sebelum mulai belajar."}
              </p>
            )}
          </div>
        </div>

        {error ? (
          <Button
            variant="outline"
            className="self-start md:self-auto"
            onClick={() => {
              setLoading(true);
              setError("");
              setOverview(null);
              setRetryCount((count) => count + 1);
            }}
          >
            Coba lagi
          </Button>
        ) : overview?.available ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            {finished ? (
              <>
                <Button asChild variant="brand">
                  <Link href={`/courses/${courseId}/tutor`}>Buka AI Tutor</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/mahasiswa/courses/${courseId}/student-profile`}>
                    Profil Belajar
                  </Link>
                </Button>
                {overview.posttest?.available && (
                  <Button asChild variant="ghost">
                    <Link
                      href={`/mahasiswa/courses/${courseId}/posttest${overview.posttest.status === "SUBMITTED" ? "/result" : ""}`}
                    >
                      {overview.posttest.status === "SUBMITTED"
                        ? "Hasil Post-test"
                        : overview.posttest.status === "IN_PROGRESS"
                          ? "Lanjutkan Post-test"
                          : "Mulai Post-test"}
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              <Button asChild variant="brand">
                <Link href={`/mahasiswa/courses/${courseId}/pretest`}>
                  {inProgress ? "Lanjutkan Pre-test" : "Mulai Pre-test"}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
