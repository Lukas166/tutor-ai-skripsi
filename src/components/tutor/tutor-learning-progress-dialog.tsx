"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Info, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { abilityStatusLabels, learningStageLabels } from "@/components/assessment/status-labels";
import { assessmentRequest, type StudentProfile } from "@/components/assessment/types";
import { cn } from "@/lib/utils";

type Topic = StudentProfile["topics"][number];
type Indicator = Topic["indicators"][number];

function IndicatorRow({ indicator, isNext, onRequestReview }: {
  indicator: Indicator;
  isNext: boolean;
  onRequestReview: (code: string, concept: string) => void;
}) {
  const completed = indicator.learning.stage === "COMPLETED";
  const required = indicator.learning.requiredQuestions;
  const done = indicator.learning.completedQuestions;

  return (
    <details className="group/indicator border-t border-border/70" open={isNext || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3.5 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className={cn(
          "grid min-h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 text-xs font-medium",
          completed ? "bg-foreground text-background" : isNext ? "bg-brand text-black" : "bg-muted text-muted-foreground",
        )} aria-hidden="true">
          {indicator.code}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{indicator.concept}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {learningStageLabels[indicator.learning.stage]}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
            <span className={cn("block h-full rounded-full", completed ? "bg-foreground" : "bg-brand")}
              style={{ width: `${required ? Math.min(100, done / required * 100) : 0}%` }} />
          </span>
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground" aria-label={`${done} dari ${required} kartu selesai`}>{done}/{required}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/indicator:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{indicator.description}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg bg-muted/45 p-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Pre-test</dt>
            <dd className="mt-1 font-medium">{indicator.initialScore === 1 ? "Benar" : indicator.initialScore === 0 ? "Salah" : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Kemampuan saat ini</dt>
            <dd className="mt-1 font-medium">{abilityStatusLabels[indicator.currentStatus]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Performa (EMA)</dt>
            <dd className="mt-1 font-medium tabular-nums">{indicator.currentScore?.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Bukti penilaian</dt>
            <dd className="mt-1 font-medium tabular-nums">{indicator.evidenceCount}</dd>
          </div>
        </dl>
        {indicator.learning.stage === "REVIEW_REQUIRED" && (
          <Button className="mt-3" size="sm" variant="outline"
            onClick={() => onRequestReview(indicator.code, indicator.concept)}>
            Tinjau bersama Tutor AI
          </Button>
        )}
      </div>
    </details>
  );
}

function TopicSection({ topic, nextIndicatorCode, initiallyOpen, onRequestReview }: {
  topic: Topic;
  nextIndicatorCode: string | null;
  initiallyOpen: boolean;
  onRequestReview: (code: string, concept: string) => void;
}) {
  const completed = topic.indicators.filter((item) => item.learning.stage === "COMPLETED").length;
  const total = topic.indicators.length;

  return (
    <details className="group/topic border-b border-border/70 last:border-b-0" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-3 py-4 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="w-7 shrink-0 text-center text-sm tabular-nums text-muted-foreground">{topic.orderNumber}</span>
        <span className="min-w-0 flex-1 text-sm font-medium">{topic.title}</span>
        <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
          <span className="block h-full rounded-full bg-brand" style={{ width: `${total ? completed / total * 100 : 0}%` }} />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{completed}/{total}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/topic:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-2 sm:pl-10">
        {topic.indicators.map((indicator) => (
          <IndicatorRow key={indicator.id} indicator={indicator}
            isNext={indicator.code === nextIndicatorCode} onRequestReview={onRequestReview} />
        ))}
      </div>
    </details>
  );
}

export function TutorLearningProgressDialog({ courseId, open, onOpenChange, onRequestReview }: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestReview: (code: string, concept: string) => void;
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setProfile(null);
    assessmentRequest<StudentProfile>(`/api/mahasiswa/courses/${courseId}/student-profile`)
      .then((data) => { if (active) { setProfile(data); setError(""); } })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, open, reload]);

  const completed = profile?.learningProgress.completedIndicators ?? 0;
  const total = profile?.learningProgress.totalIndicators ?? 0;
  const percentage = total ? completed / total * 100 : 0;
  const nextIndicatorCode = profile?.learningProgress.nextIndicatorCode ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pr-14">
          <div className="flex items-center gap-2">
            <DialogTitle>Progres belajar</DialogTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Penjelasan progres belajar">
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Kartu selesai menunjukkan latihan yang sudah dilalui. EMA (0–1) dihitung dari jawaban pertama tanpa petunjuk.
              </TooltipContent>
            </Tooltip>
          </div>
          <DialogDescription className="sr-only">Progres per materi dan indikator belajar.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b border-border/70 px-5 pb-5 sm:px-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Indikator selesai</p>
              <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">
                {loading && !profile ? "—" : completed}
                <span className="ml-1 text-sm font-normal text-muted-foreground">/ {total}</span>
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => setReload((value) => value + 1)}>
              <RotateCw data-icon="inline-start" />Perbarui
            </Button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar"
            aria-label="Indikator belajar selesai" aria-valuenow={completed} aria-valuemin={0} aria-valuemax={total || 1}>
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percentage}%` }} />
          </div>
          {!!profile?.learningProgress.reviewPendingCount && (
            <p className="mt-2 text-xs text-muted-foreground">
              {profile.learningProgress.reviewPendingCount} indikator perlu tinjauan ulang
            </p>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto px-5 sm:px-6">
          {error && <p className="py-5 text-sm text-destructive" role="alert">{error}</p>}
          {!profile && loading && <Skeleton className="my-5 h-52 w-full" />}
          {profile?.topics.map((topic, index) => (
            <TopicSection key={topic.id} topic={topic} nextIndicatorCode={nextIndicatorCode}
              initiallyOpen={nextIndicatorCode
                ? topic.indicators.some((indicator) => indicator.code === nextIndicatorCode)
                : index === 0}
              onRequestReview={onRequestReview} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
