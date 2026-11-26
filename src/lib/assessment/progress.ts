import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";

export type IndicatorProgress = {
  indicatorId: string;
  indicatorCode: string;
  topicId: string;
  initialScore: number | null;
  currentScore: number | null;
  lessonDelivered: boolean;
  completedQuestions: number;
  requiredQuestions: number;
  reviewRequired: boolean;
  reviewDone: boolean;
  stage: "UNAVAILABLE" | "NOT_STARTED" | "LESSON_REQUIRED" | "PRACTICING" | "REVIEW_REQUIRED" | "PRETEST_MET" | "COMPLETED";
};

export type LearningProgress = {
  totalIndicators: number;
  completedIndicators: number;
  posttestReady: boolean;
  reviewPendingCount: number;
  nextIndicatorId: string | null;
  nextIndicatorCode: string | null;
  indicators: IndicatorProgress[];
};

export async function readLearningProgress(
  studentId: string, courseId: string, db: Prisma.TransactionClient = prisma,
): Promise<LearningProgress> {
  // Python menghitung tahap latihan. Hasil pre-test yang tetap benar diterapkan
  // saat membaca agar snapshot lama dan pre-test yang baru selesai konsisten.
  const [row, indicators] = await Promise.all([
    db.studentLearningProgress.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { progressSnapshot: true },
    }),
    db.domainIndicator.findMany({
      where: { courseId },
      select: { id: true, code: true, topicId: true,
        profiles: { where: { studentId, courseId },
          select: { initialScore: true, currentScore: true } } },
      orderBy: [{ topic: { orderNumber: "asc" } }, { code: "asc" }],
    }),
  ]);
  const saved = row?.progressSnapshot as LearningProgress | null | undefined;
  const savedById = new Map(
    Array.isArray(saved?.indicators)
      ? saved.indicators.map((indicator) => [indicator.indicatorId, indicator])
      : [],
  );
  const stages: IndicatorProgress[] = indicators.map((indicator) => {
    const previous = savedById.get(indicator.id);
    const initialScore = indicator.profiles[0]?.initialScore ?? null;
    return {
      indicatorId: indicator.id,
      indicatorCode: indicator.code,
      topicId: indicator.topicId,
      initialScore,
      currentScore: indicator.profiles[0]?.currentScore ?? previous?.currentScore ?? null,
      lessonDelivered: previous?.lessonDelivered ?? false,
      completedQuestions: previous?.completedQuestions ?? 0,
      requiredQuestions: previous?.requiredQuestions ?? 2,
      reviewRequired: initialScore === 1 ? false : previous?.reviewRequired ?? false,
      reviewDone: previous?.reviewDone ?? false,
      stage: initialScore === 1 ? "PRETEST_MET" : previous?.stage === "PRETEST_MET"
        ? "NOT_STARTED" : previous?.stage ?? "NOT_STARTED",
    };
  });
  const isMet = (indicator: IndicatorProgress) =>
    indicator.stage === "PRETEST_MET" || indicator.stage === "COMPLETED";
  const next = stages.find((indicator) => !isMet(indicator));
  return {
    totalIndicators: stages.length,
    completedIndicators: stages.filter(isMet).length,
    posttestReady: stages.length > 0 && stages.every(isMet),
    reviewPendingCount: stages.filter((indicator) => indicator.stage === "REVIEW_REQUIRED").length,
    nextIndicatorId: next?.indicatorId ?? null,
    nextIndicatorCode: next?.indicatorCode ?? null,
    indicators: stages,
  };
}

export function posttestAvailability(
  progress: LearningProgress,
  preSubmitted: boolean,
  postStatus: string | null,
) {
  const complete = preSubmitted && progress.posttestReady;
  const unavailable = progress.indicators.some((item) => item.stage === "UNAVAILABLE");
  return {
    available: complete || postStatus !== null,
    status: postStatus ?? "NOT_STARTED",
    remainingStudySeconds: 0,
    completedIndicators: progress.completedIndicators,
    totalIndicators: progress.totalIndicators,
    reviewPendingCount: progress.reviewPendingCount,
    reason: complete || postStatus ? null
      : !preSubmitted ? "Selesaikan pre-test dahulu."
      : unavailable ? "Bank soal latihan indikator belum lengkap; hubungi dosen."
      : progress.reviewPendingCount > 0 ? "Tinjau ulang indikator yang masih perlu penguatan bersama Tutor AI."
      : "Indikator yang belum terpenuhi memerlukan pembelajaran dan dua kartu latihan.",
  };
}
