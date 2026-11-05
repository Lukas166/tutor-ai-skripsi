"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronDown, MessageCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assessmentRequest } from "./types";

type Score = {
  percentage: number;
  correctCount: number;
  totalQuestions: number;
  status: string;
};
type Comparison = {
  completed: boolean;
  pretest: Score | null;
  posttest: Score | null;
  delta: number | null;
  topics: {
    id: string;
    code: string;
    title: string;
    preCorrect: number;
    postCorrect: number;
    indicators: {
      id: string;
      code: string;
      description: string;
      preCorrect: boolean;
      postCorrect: boolean;
    }[];
  }[];
};

function ComparisonTopic({ topic }: { topic: Comparison["topics"][number] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <button
        type="button"
        className="flex w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expanded}
        aria-controls={"comparison-topic-" + topic.id}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">
            {topic.code}
          </span>
          <span className="mt-1 block text-base font-semibold">{topic.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
          {topic.preCorrect}/{topic.indicators.length} → {topic.postCorrect}/
          {topic.indicators.length} benar
          <ChevronDown
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
          />
        </span>
      </button>

      <div
        id={"comparison-topic-" + topic.id}
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
                  {indicator.code}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {indicator.description}
                </p>
              </div>
              <p className="shrink-0 text-xs font-medium text-muted-foreground sm:pt-1">
                Awal {indicator.preCorrect ? "benar" : "belum benar"} → Akhir{" "}
                {indicator.postCorrect ? "benar" : "belum benar"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function LearningResults({ courseId }: { courseId: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    assessmentRequest<Comparison>("/api/mahasiswa/courses/" + courseId + "/learning")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [courseId]);

  if (!data && !error) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <Button asChild variant="ghost" className="-ml-3 self-start">
        <Link href={"/mahasiswa/courses/" + courseId}>
          <ArrowLeft data-icon="inline-start" />
          Kembali ke Mata Kuliah
        </Link>
      </Button>
      <h1 className="text-3xl font-bold tracking-tight">Hasil Pembelajaran</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && !data.completed && (
        <Card className="gap-0 border-border/70 py-0 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Hasil belum tersedia</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Selesaikan post-test untuk melihat perubahan hasil belajar.
              </p>
            </div>
            <Button asChild variant="brand">
              <Link href={"/mahasiswa/courses/" + courseId}>
                Kembali ke Mata Kuliah
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {data?.completed && (
        <>
          <section className="flex flex-col gap-6 rounded-xl border border-border/70 bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Pre-test</p>
                <p className="mt-1 text-3xl font-bold">
                  {data.pretest?.percentage.toLocaleString("id-ID", {
                    maximumFractionDigits: 1,
                  })}%
                </p>
              </div>
              <ArrowRight className="hidden size-5 text-muted-foreground sm:block" />
              <div>
                <p className="text-sm text-muted-foreground">Post-test</p>
                <p className="mt-1 text-3xl font-bold">
                  {data.posttest?.percentage.toLocaleString("id-ID", {
                    maximumFractionDigits: 1,
                  })}%
                </p>
              </div>
            </div>
            <p className="text-sm font-medium">
              {data.delta !== null && data.delta > 0 ? "+" : ""}
              {data.delta?.toLocaleString("id-ID", {
                maximumFractionDigits: 1,
              })} poin
            </p>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="brand">
              <Link href={"/courses/" + courseId + "/tutor"}>
                <MessageCircle data-icon="inline-start" />
                Buka AI Tutor
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={"/mahasiswa/courses/" + courseId + "/student-profile"}>
                Profil Belajar
              </Link>
            </Button>
          </div>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-bold tracking-tight">Hasil per materi</h2>
            {data.topics.map((topic) => (
              <ComparisonTopic key={topic.id} topic={topic} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
