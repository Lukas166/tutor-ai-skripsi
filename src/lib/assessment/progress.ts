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
  stage: "UNAVAILABLE" | "NOT_STARTED" | "LESSON_REQUIRED" | "PRACTICING" | "REVIEW_REQUIRED" | "COMPLETED";
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

export async function readLearningProgress(studentId: string, courseId: string): Promise<LearningProgress> {
  // Snapshot ditulis oleh Learner Model Python; API LMS tidak menghitung tahap adaptif.
  const row = await prisma.studentLearningProgress.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { progressSnapshot: true },
  });
  const saved = row?.progressSnapshot as LearningProgress | null | undefined;
  if (saved && Array.isArray(saved.indicators)
    && typeof saved.posttestReady === "boolean") return saved;

  // Sebelum aktivitas Tutor AI pertama, semua indikator belum dimulai.
  const indicators = await prisma.domainIndicator.findMany({
    where: { courseId }, select: { id: true, code: true, topicId: true },
    orderBy: { code: "asc" },
  });
  return {
    totalIndicators: indicators.length,
    completedIndicators: 0,
    posttestReady: false,
    reviewPendingCount: 0,
    nextIndicatorId: indicators[0]?.id ?? null,
    nextIndicatorCode: indicators[0]?.code ?? null,
    indicators: indicators.map((indicator) => ({
      indicatorId: indicator.id, indicatorCode: indicator.code,
      topicId: indicator.topicId, initialScore: null, currentScore: null,
      lessonDelivered: false, completedQuestions: 0, requiredQuestions: 2,
      reviewRequired: false, reviewDone: false, stage: "NOT_STARTED" as const,
    })),
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
      : "Selesaikan pembelajaran dan dua kartu latihan pada setiap indikator.",
  };
}
