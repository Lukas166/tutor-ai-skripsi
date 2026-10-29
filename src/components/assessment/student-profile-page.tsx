"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  Info,
  MessageCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { assessmentRequest, type StudentProfile } from "./types";

const statusLabels = {
  NOT_ASSESSED: "Belum dinilai",
  NEEDS_REINFORCEMENT: "Perlu penguatan",
  INITIAL_POSITIVE_EVIDENCE: "Indikasi awal baik (bukti terbatas)",
};

export function StudentProfilePage({
  courseId,
  resultOnly = false,
}: {
  courseId: string;
  resultOnly?: boolean;
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    assessmentRequest<StudentProfile>(
      `/api/mahasiswa/courses/${courseId}/student-profile`,
    )
      .then((data) => {
        if (active) setProfile(data);
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
  }, [courseId]);
  if (loading)
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (!profile)
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertTitle>Profil belum dapat dibuka</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/mahasiswa/courses/${courseId}`}>
            Kembali ke Mata Kuliah
          </Link>
        </Button>
      </div>
    );
  const completed = profile.attempt?.status === "SUBMITTED";
  const total = profile.topics.reduce(
    (sum, topic) => sum + topic.indicators.length,
    0,
  );
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7">
      <Button asChild variant="ghost" className="self-start">
        <Link href={`/mahasiswa/courses/${courseId}`}>
          <ArrowLeft data-icon="inline-start" />
          Kembali ke Mata Kuliah
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {profile.course.title}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {resultOnly ? "Hasil Pre-test" : "Student Profile Awal"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {resultOnly && completed
              ? "Jawaban Anda telah dinilai dan profil kemampuan awal tersimpan."
              : "Peta kemampuan awal berdasarkan indikator pembelajaran mata kuliah."}
          </p>
        </div>
        <Badge variant={completed ? "default" : "secondary"}>
          {completed ? "Baseline tersimpan" : "Belum dinilai"}
        </Badge>
      </div>
      <Alert>
        <Info />
        <AlertTitle>Satu indikator, satu bukti awal</AlertTitle>
        <AlertDescription>
          Hasil ini merupakan indikasi kemampuan awal dari satu soal per
          indikator, bukan sertifikasi penguasaan. Jawaban benar adalah bukti
          positif awal; jawaban salah menandai kebutuhan penguatan.
        </AlertDescription>
      </Alert>
      {!completed ? (
        <Card>
          <CardHeader>
            <CardTitle>Mulai dari pre-test</CardTitle>
            <CardDescription>
              Profil indikator akan terbentuk otomatis setelah seluruh jawaban
              difinalisasi.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href={`/mahasiswa/courses/${courseId}/pretest`}>
                {profile.attempt ? "Lanjutkan Pre-test" : "Mulai Pre-test"}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardDescription>SKOR KESELURUHAN PRE-TEST</CardDescription>
              <CardTitle className="flex flex-wrap items-baseline gap-3">
                <span className="text-5xl font-bold tracking-tight">
                  {profile.attempt!.correctCount}
                  <span className="text-2xl text-muted-foreground">
                    /{profile.attempt!.totalQuestions}
                  </span>
                </span>
                <span className="text-xl text-muted-foreground">
                  {profile.attempt!.percentage!.toLocaleString("id-ID", {
                    maximumFractionDigits: 1,
                  })}
                  %
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Diselesaikan{" "}
                {new Date(profile.attempt!.submittedAt!).toLocaleString(
                  "id-ID",
                  { dateStyle: "long", timeStyle: "short" },
                )}
                . Kunci, pembahasan, dan penilaian per soal belum ditampilkan
                karena paket soal digunakan kembali pada post-test.
              </p>
            </CardContent>
            {resultOnly && (
              <CardFooter>
                <Button asChild>
                  <Link href={`/mahasiswa/courses/${courseId}/student-profile`}>
                    <BrainCircuit data-icon="inline-start" />
                    Lihat Profil Belajar
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            )}
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                profile.positiveCount,
                "Indikasi awal baik",
                "Bukti awal positif, masih terbatas",
              ],
              [
                profile.reinforcementCount,
                "Perlu penguatan",
                "Fokus pemahaman untuk pembelajaran berikutnya",
              ],
              [
                `${profile.topics.length} materi`,
                `${profile.assessedCount}/${total} indikator dinilai`,
                "Cakupan baseline mata kuliah",
              ],
            ].map(([value, label, description]) => (
              <Card key={label}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-3xl">{value}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      {!resultOnly && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold">Peta indikator per materi</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Baseline tetap disimpan; performa terkini disiapkan untuk bukti
              pembelajaran berikutnya.
            </p>
          </div>
          {profile.topics.map((topic) => (
            <Card key={topic.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">Pertemuan {topic.orderNumber}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {topic.code}
                  </span>
                </div>
                <CardTitle className="text-xl">{topic.title}</CardTitle>
                <CardDescription>
                  {completed
                    ? `${topic.initialPositiveCount}/${topic.indicators.length} indikator menunjukkan bukti positif pada pre-test`
                    : "Belum ada baseline pre-test"}{" "}
                  · {topic.cpmkCodes.join(", ")} · Sub-CPMK{" "}
                  {topic.subCpmkCodes.join(", ")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-4">
                  {topic.indicators.map((indicator) => (
                    <li
                      key={indicator.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {indicator.code} · {indicator.concept}
                        </p>
                        <p className="text-sm leading-relaxed">
                          {indicator.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {indicator.evidenceCount} bukti
                          {indicator.initialScore !== null
                            ? ` · Nilai awal ${indicator.initialScore}/1 · Performa terkini ${indicator.currentScore}/1`
                            : " · Belum ada hasil penilaian"}
                        </p>
                      </div>
                      <Badge
                        className="shrink-0 whitespace-normal"
                        variant={
                          indicator.initialStatus ===
                          "INITIAL_POSITIVE_EVIDENCE"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {statusLabels[indicator.initialStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Sumber materi: {topic.sourcePdf} · hal. {topic.sourcePages}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/mahasiswa/courses/${courseId}#materi`}>
                    <BookOpen data-icon="inline-start" />
                    Buka Materi
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5" />
            Lanjutkan pembelajaran
          </CardTitle>
          <CardDescription>
            Pelajari materi dan diskusikan pertanyaan melalui AI Tutor yang
            sudah tersedia.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/mahasiswa/courses/${courseId}#materi`}>
              <BookOpen data-icon="inline-start" />
              Lanjut Belajar
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/mahasiswa/courses/${courseId}/tutor`}>
              <MessageCircle data-icon="inline-start" />
              Buka AI Tutor
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
