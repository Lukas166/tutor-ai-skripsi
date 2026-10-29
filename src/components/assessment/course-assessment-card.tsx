"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-5" />
            {finished ? "Pembelajaran Adaptif" : "Profil Belajar Awal"}
          </CardTitle>
          {overview?.available && (
            <Badge variant={finished ? "default" : "secondary"}>
              {finished
                ? "Pre-test selesai"
                : inProgress
                  ? "Sedang dikerjakan"
                  : "Belum dimulai"}
            </Badge>
          )}
        </div>
        <CardDescription>
          {finished
            ? "Pelajari materi, coba latihan konsep, lalu ukur hasil dengan post-test."
            : "Kenali kemampuan awal sebelum melanjutkan pembelajaran."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat status pre-test…
          </p>
        ) : error ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setError("");
                setOverview(null);
                setRetryCount((count) => count + 1);
              }}
            >
              Coba Lagi
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {overview?.totalQuestions} soal pilihan ganda dari{" "}
              {overview?.topicCount} materi. Hasil membentuk indikasi kemampuan
              awal dengan bukti terbatas, bukan sertifikasi penguasaan.
            </p>
            {finished && overview?.posttest && (
              <p className="text-sm text-muted-foreground">
                {overview.posttest.available
                  ? "Post-test tersedia untuk mengukur hasil belajar. Tidak ada syarat status penguasaan indikator."
                  : overview.posttest.reason}
              </p>
            )}
          </div>
        )}
      </CardContent>
      {overview?.available && (
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild>
            <Link
              href={`/mahasiswa/courses/${courseId}/${finished ? "student-profile" : "pretest"}`}
            >
              {finished
                ? "Lihat Student Profile"
                : inProgress
                  ? "Lanjutkan Pre-test"
                  : "Mulai Pre-test"}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          {finished && (
            <>
              <Button asChild variant="secondary">
                <Link href={`/courses/${courseId}/tutor`}>
                  Lanjut Belajar di AI Tutor
                </Link>
              </Button>
              {overview?.posttest?.available && (
                <Button asChild variant="outline">
                  <Link
                    href={`/mahasiswa/courses/${courseId}/posttest${overview.posttest.status === "SUBMITTED" ? "/result" : ""}`}
                  >
                    {overview.posttest.status === "SUBMITTED"
                      ? "Lihat Perbandingan Hasil"
                      : overview.posttest.status === "IN_PROGRESS"
                        ? "Lanjutkan Post-test"
                        : "Mulai Post-test"}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/mahasiswa/courses/${courseId}/pretest/result`}>
                  Hasil Pre-test
                </Link>
              </Button>
            </>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
