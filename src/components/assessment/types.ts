export type Option = "A" | "B" | "C" | "D";
export type Attempt = {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED";
  startedAt: string;
  submittedAt: string | null;
  correctCount: number | null;
  totalQuestions: number;
  percentage: number | null;
  remainingSeconds: number;
  questions: {
    id: string;
    number: number;
    question: string;
    options: Partial<Record<Option, string>>;
    selectedOption: Option | null;
  }[];
};
export type AssessmentReview = {
  kind: "PRE" | "POST";
  totalQuestions: number;
  correctCount: number;
  answersRevealed: boolean;
  questions: {
    number: number;
    question: string;
    options: Record<Option, string>;
    selectedOption: Option | null;
    isCorrect: boolean | null;
    correctOption: Option | null;
    explanation: string | null;
    topicTitle: string;
  }[];
};
export type AssessmentOverview = {
  available: boolean;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
  attemptId: string | null;
  topicCount: number;
  totalQuestions: number;
  posttest: {
    available: boolean;
    status: "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
    reason: string | null;
    remainingStudySeconds: number;
    completedIndicators: number;
    totalIndicators: number;
    reviewPendingCount: number;
  };
};
export type StudentProfile = {
  course: { id: string; title: string };
  attempt: Attempt | null;
  totalQuestions: number;
  assessedCount: number;
  positiveCount: number;
  reinforcementCount: number;
  learningProgress: {
    completedIndicators: number;
    totalIndicators: number;
    reviewPendingCount: number;
    nextIndicatorCode: string | null;
  };
  topics: {
    id: string;
    code: string;
    title: string;
    orderNumber: number;
    courseSessionId: string | null;
    cpmkCodes: string[];
    subCpmkCodes: string[];
    sourcePdf: string;
    sourcePages: string;
    initialPositiveCount: number;
    indicators: {
      id: string;
      code: string;
      description: string;
      concept: string;
      initialScore: number | null;
      currentScore: number | null;
      evidenceCount: number;
      initialStatus:
        | "NOT_ASSESSED"
        | "NEEDS_REINFORCEMENT"
        | "INITIAL_POSITIVE_EVIDENCE";
      currentStatus: "NOT_ASSESSED" | "NEEDS_REINFORCEMENT" | "INITIAL_POSITIVE_EVIDENCE" | "DEVELOPING" | "READY_TO_ADVANCE";
      learning: {
        lessonDelivered: boolean;
        completedQuestions: number;
        requiredQuestions: number;
        reviewRequired: boolean;
        reviewDone: boolean;
        stage: "UNAVAILABLE" | "NOT_STARTED" | "LESSON_REQUIRED" | "PRACTICING" | "REVIEW_REQUIRED" | "PRETEST_MET" | "COMPLETED";
      };
    }[];
  }[];
};

export async function assessmentRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Permintaan tidak berhasil. Coba lagi.");
  return data as T;
}
