"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assessmentRequest, type AssessmentReview, type Option } from "./types";

const OPTIONS: Option[] = ["A", "B", "C", "D"];

function answerStatus(question: AssessmentReview["questions"][number]) {
  if (!question.selectedOption) return "Tidak dijawab";
  return question.isCorrect ? "Benar" : "Salah";
}

export function AssessmentReviewPage({
  courseId,
  kind,
}: {
  courseId: string;
  kind: "pretest" | "posttest";
}) {
  const [review, setReview] = useState<AssessmentReview | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const label = kind === "pretest" ? "Pre-test" : "Post-test";
  const backHref = kind === "pretest"
    ? `/mahasiswa/courses/${courseId}/student-profile`
    : `/mahasiswa/courses/${courseId}/posttest/result`;

  useEffect(() => {
    let active = true;
    assessmentRequest<AssessmentReview>(`/api/mahasiswa/courses/${courseId}/${kind}/review`)
      .then((data) => {
        if (active) setReview(data);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Ulasan belum dapat dibuka.");
      });
    return () => { active = false; };
  }, [courseId, kind]);

  if (!review && !error) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const question = review?.questions[index];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Button variant="ghost" asChild className="-ml-3 self-start">
        <Link href={backHref}>
          <ArrowLeft data-icon="inline-start" />
          {kind === "pretest" ? "Kembali ke Profil Belajar" : "Kembali ke Hasil Pembelajaran"}
        </Link>
      </Button>

      <header>
        <h1 className="text-3xl font-bold tracking-tight">Tinjauan {label}</h1>
        {review && (
          <p className="mt-1 text-sm text-muted-foreground">
            {review.correctCount} dari {review.totalQuestions} jawaban benar
          </p>
        )}
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Ulasan belum dapat dibuka</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {review && question && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section className="min-w-0 px-1 py-1 sm:px-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">Soal {question.number}</p>
              <p className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                !question.selectedOption ? "text-muted-foreground" : question.isCorrect
                  ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
              )}>
                {question.selectedOption
                  ? question.isCorrect ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />
                  : <Circle className="size-4" />}
                {answerStatus(question)}
              </p>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{question.topicTitle}</p>
            <h2 className="max-w-3xl text-lg font-semibold leading-relaxed sm:text-xl">
              {question.question}
            </h2>

            <div className="mt-6" role="list" aria-label="Pilihan jawaban">
              {OPTIONS.map((option) => {
                const selected = question.selectedOption === option;
                const correct = review.answersRevealed && question.correctOption === option;
                const color = correct || (selected && question.isCorrect)
                  ? "text-emerald-700 dark:text-emerald-400"
                  : selected && !question.isCorrect ? "text-destructive" : "text-foreground";
                return (
                  <div key={option} role="listitem" className="flex items-start gap-5 py-3 leading-6">
                    {selected
                      ? <CircleDot className={cn("mt-1 size-4 shrink-0", color)} />
                      : correct
                        ? <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                        : <Circle className="mt-1 size-4 shrink-0 text-muted-foreground/70" />}
                    <div className="min-w-0">
                      <p className={cn("flex items-start gap-2", color)}>
                        <span className="shrink-0 font-semibold">{option}.</span>
                        <span>{question.options[option]}</span>
                      </p>
                      {selected && <span className="sr-only">Pilihan Anda</span>}
                      {correct && (
                        <p className={cn("mt-1 text-xs font-medium", color)}>
                          Jawaban benar
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {review.answersRevealed && question.explanation && (
              <div className="mt-7 max-w-3xl space-y-2">
                <h3 className="font-semibold">Pembahasan</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{question.explanation}</p>
              </div>
            )}
            <div className="mt-8 flex justify-between gap-3">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                <ArrowLeft data-icon="inline-start" /> Sebelumnya
              </Button>
              <Button variant="outline" disabled={index === review.questions.length - 1} onClick={() => setIndex(index + 1)}>
                Berikutnya <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </section>

          <aside className="rounded-xl border border-border/70 bg-card p-5 shadow-sm lg:sticky lg:top-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">Daftar soal</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{index + 1}/{review.totalQuestions}</span>
            </div>
            <nav aria-label="Nomor soal" className="mt-5 grid grid-cols-5 gap-2">
              {review.questions.map((item, position) => (
                <Button
                  key={item.number}
                  variant={position === index ? "brand" : "outline"}
                  size="icon-sm"
                  className={cn(position !== index && (
                    !item.selectedOption ? "border-dashed text-muted-foreground"
                      : item.isCorrect ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                        : "border-destructive text-destructive"
                  ))}
                  aria-label={`Soal ${item.number}, ${answerStatus(item)}`}
                  aria-current={position === index ? "step" : undefined}
                  onClick={() => setIndex(position)}
                >
                  {item.number}
                </Button>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}
