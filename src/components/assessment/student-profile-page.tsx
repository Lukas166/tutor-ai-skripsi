"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Info,
  MessageCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { assessmentRequest, type StudentProfile } from "./types";
import { AssessmentGuide } from "./assessment-guide";

const statusLabels = {
  NOT_ASSESSED: "Belum dinilai",
  NEEDS_REINFORCEMENT: "Perlu penguatan",
  INITIAL_POSITIVE_EVIDENCE: "Indikasi awal baik",
  DEVELOPING: "Sedang berkembang",
  READY_TO_ADVANCE: "Siap lanjut",
};

function ProfileSummary({ profile, courseId }: { profile: StudentProfile; courseId: string }) {
  const attempt = profile.attempt!;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Hasil Pre-test</h2>
          {attempt.submittedAt && (
            <time dateTime={attempt.submittedAt} className="mt-1 block text-xs text-muted-foreground">
              {new Date(attempt.submittedAt).toLocaleString("id-ID", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              })}
            </time>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/mahasiswa/courses/${courseId}/pretest/review`}>
            Tinjau jawaban
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Skor</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {attempt.percentage!.toLocaleString("id-ID", {
              maximumFractionDigits: 1,
            })}
            <span className="text-xl">%</span>
          </p>
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            {attempt.correctCount} dari {attempt.totalQuestions} jawaban benar
          </p>
        </div>
        <div className="flex flex-col rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Indikasi awal baik</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{profile.positiveCount}</p>
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            dari {profile.assessedCount} indikator
          </p>
        </div>
        <div className="flex flex-col rounded-xl border border-border/70 bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Perlu penguatan</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{profile.reinforcementCount}</p>
          <p className="mt-auto pt-2 text-xs text-muted-foreground">
            dari {profile.assessedCount} indikator
          </p>
        </div>
      </div>
    </section>
  );
}

function ProfileTopic({
  topic,
  courseId,
}: {
  topic: StudentProfile["topics"][number];
  courseId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const reinforcementCount = topic.indicators.filter(
    (indicator) => indicator.currentStatus === "NEEDS_REINFORCEMENT",
  ).length;
  const materialHref = topic.courseSessionId
    ? "/mahasiswa/courses/" + courseId + "#session-" + topic.courseSessionId
    : "/mahasiswa/courses/" + courseId + "#materi";

  return (
    <article className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col gap-2 p-5 text-left hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          aria-expanded={expanded}
          aria-controls={"profile-topic-" + topic.id}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-muted-foreground">
              Pertemuan {topic.orderNumber}
            </span>
            <span className="mt-1 block text-base font-semibold">{topic.title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {reinforcementCount > 0 ? (
              <>{reinforcementCount} perlu penguatan</>
            ) : (
              "Tidak ada fokus penguatan"
            )}
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </span>
        </button>
        <div className="flex items-center justify-end px-5 pb-5 sm:py-5 sm:pl-0">
          <Button asChild variant="outline" size="sm">
            <Link href={materialHref}>
              <BookOpen data-icon="inline-start" />
              {topic.courseSessionId ? "Buka Materi" : "Daftar Materi"}
            </Link>
          </Button>
        </div>
      </div>

      <div
        id={"profile-topic-" + topic.id}
        hidden={!expanded}
        className="px-5 pb-5"
      >
        <ul className="divide-y divide-border/70 border-t border-border/70">
          {topic.indicators.map((indicator) => (
            <li
              key={indicator.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {indicator.code} · {indicator.concept}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {indicator.description}
                </p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <dt>Hasil pre-test</dt>
                    <dd className="font-semibold text-foreground">
                      {indicator.initialScore === null
                        ? "—"
                        : indicator.initialScore === 1
                          ? "Benar"
                          : "Salah"}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Performa belajar terkini</dt>
                    <dd className="font-semibold text-foreground">
                      {indicator.currentScore === null
                        ? "—"
                        : indicator.currentScore.toLocaleString("id-ID", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Bukti penilaian</dt>
                    <dd className="font-semibold text-foreground">
                      {indicator.evidenceCount} kali
                    </dd>
                  </div>
                </dl>
              </div>
              <p className="flex shrink-0 items-center gap-2 text-xs font-medium sm:pt-1">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    indicator.currentStatus === "NEEDS_REINFORCEMENT"
                      ? "bg-brand"
                      : indicator.currentStatus === "NOT_ASSESSED"
                        ? "border border-foreground/50"
                        : "bg-foreground",
                  )}
                />
                {statusLabels[indicator.currentStatus]}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function StudentProfilePage({ courseId }: { courseId: string }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    assessmentRequest<StudentProfile>(
      "/api/mahasiswa/courses/" + courseId + "/student-profile",
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

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertTitle>Profil belum dapat dibuka</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="self-start">
          <Link href={"/mahasiswa/courses/" + courseId}>
            Kembali ke Mata Kuliah
          </Link>
        </Button>
      </div>
    );
  }

  const completed = profile.attempt?.status === "SUBMITTED";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={"/mahasiswa/courses/" + courseId}>
          <ArrowLeft data-icon="inline-start" />
          Kembali ke Mata Kuliah
        </Link>
      </Button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            {profile.course.title}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {completed ? "Profil Belajar" : "Panduan Pre-test"}
          </h1>
        </div>
        {completed && (
          <Button asChild variant="brand" className="self-start sm:self-auto">
            <Link href={"/courses/" + courseId + "/tutor"}>
              <MessageCircle data-icon="inline-start" />
              Buka AI Tutor
            </Link>
          </Button>
        )}
      </header>

      {!completed ? (
        <AssessmentGuide
          kind="pretest"
          questionCount={profile.totalQuestions}
          inProgress={profile.attempt?.status === "IN_PROGRESS"}
          action={
            <Button asChild variant="brand">
              <Link href={
                "/mahasiswa/courses/" + courseId + "/pretest" +
                (profile.attempt ? "" : "?start=1")
              }>
                {profile.attempt ? "Lanjutkan Pre-test" : "Mulai Pre-test"}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          }
        />
      ) : (
        <ProfileSummary profile={profile} courseId={courseId} />
      )}

      {completed && (
        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">
              Fokus belajar per materi
            </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Penjelasan hasil dan bukti penilaian"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 py-3 text-left leading-relaxed">
                <dl className="space-y-2">
                  <div>
                    <dt className="font-semibold">Hasil pre-test</dt>
                    <dd>Menunjukkan jawaban benar atau salah untuk indikator ini.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Performa belajar terkini</dt>
                    <dd>Perkiraan kemampuan terbaru, dari 0 sampai 1. Nilainya diperbarui oleh latihan mandiri.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Bukti penilaian</dt>
                    <dd>Jumlah jawaban yang dihitung: satu dari pre-test, lalu bertambah dari jawaban pertama latihan tanpa petunjuk.</dd>
                  </div>
                </dl>
              </TooltipContent>
            </Tooltip>
          </div>

          {profile.topics.map((topic) => (
            <ProfileTopic key={topic.id} topic={topic} courseId={courseId} />
          ))}
        </section>
      )}
    </div>
  );
}
