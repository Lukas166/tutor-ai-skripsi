import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import { posttestAvailability, readLearningProgress } from "./progress";

type Kind = "PRE" | "POST";
type Option = "A" | "B" | "C" | "D";
type Snapshot = {
  question: string;
  options: Record<Option, string>;
  correctOption: Option;
  explanation: string;
  sourcePdf: string;
  sourcePages: string;
};

export class AssessmentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const letters: Option[] = ["A", "B", "C", "D"];
const durationMs = 15 * 60 * 1000;

function snapshot(value: unknown): Snapshot {
  const item = value as Snapshot;
  if (!item || typeof item !== "object" || !item.options
    || letters.some((letter) => typeof item.options[letter] !== "string")
    || Object.keys(item.options).length !== 4
    || !letters.includes(item.correctOption)) {
    throw new AssessmentError(409, "Paket soal lama perlu diperbarui menjadi empat opsi A-D.");
  }
  return item;
}

function remainingSeconds(startedAt: Date) {
  return Math.max(0, Math.ceil((startedAt.getTime() + durationMs - Date.now()) / 1000));
}

async function attemptFor(studentId: string, courseId: string, kind: Kind) {
  return prisma.assessmentAttempt.findUnique({
    where: { studentId_courseId_kind: { studentId, courseId, kind } },
  });
}

async function publicAttempt(studentId: string, courseId: string, kind: Kind) {
  const attempt = await attemptFor(studentId, courseId, kind);
  if (!attempt) return null;
  const questions = attempt.status === "IN_PROGRESS"
    ? await prisma.assessmentItem.findMany({
        where: { attemptId: attempt.id }, orderBy: { orderNumber: "asc" },
      }) : [];
  return {
    id: attempt.id, status: attempt.status, startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt, correctCount: attempt.correctCount,
    totalQuestions: attempt.totalQuestions, percentage: attempt.percentage,
    remainingSeconds: attempt.status === "IN_PROGRESS" ? remainingSeconds(attempt.startedAt) : 0,
    questions: questions.map((item) => {
      const question = snapshot(item.questionSnapshot);
      // Kunci dan penjelasan tidak pernah dikirim saat soal sedang dikerjakan.
      return { id: item.questionId, number: item.orderNumber, question: question.question,
        options: question.options, selectedOption: item.selectedOption };
    }),
  };
}

export async function assessmentOverview(studentId: string, courseId: string) {
  const [config, topicCount, pre, post] = await Promise.all([
    prisma.courseLearningConfig.findUnique({ where: { courseId } }),
    prisma.domainTopic.count({ where: { courseId } }),
    attemptFor(studentId, courseId, "PRE"),
    attemptFor(studentId, courseId, "POST"),
  ]);
  const progress = pre?.status === "SUBMITTED"
    ? await readLearningProgress(studentId, courseId)
    : { totalIndicators: config?.pretestQuestionCount ?? 0, completedIndicators: 0,
        posttestReady: false, reviewPendingCount: 0,
        nextIndicatorId: null, nextIndicatorCode: null, indicators: [] };
  return {
    available: !!config, status: pre?.status ?? "NOT_STARTED", attemptId: pre?.id ?? null,
    topicCount, totalQuestions: config?.pretestQuestionCount ?? 0,
    posttest: posttestAvailability(progress, pre?.status === "SUBMITTED", post?.status ?? null),
  };
}

export async function currentAssessment(studentId: string, courseId: string, kind: Kind) {
  return publicAttempt(studentId, courseId, kind);
}

export async function startAssessment(studentId: string, courseId: string, kind: Kind) {
  await prisma.$transaction(async (tx) => {
    // Kunci course yang sama dipakai importer agar snapshot paket tidak berubah.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${courseId}))::text`;
    const existing = await tx.assessmentAttempt.findUnique({
      where: { studentId_courseId_kind: { studentId, courseId, kind } },
    });
    if (existing) return;

    if (kind === "PRE") {
      const config = await tx.courseLearningConfig.findUnique({ where: { courseId } });
      if (!config) throw new AssessmentError(404, "Pre-test belum dikonfigurasi untuk mata kuliah ini.");
      const questions = await tx.questionBankItem.findMany({
        where: { courseId, kind: "PRE_POST", topic: { courseId }, indicator: { courseId } },
        orderBy: { indicator: { code: "asc" } },
      });
      if (questions.length !== config.pretestQuestionCount
        || new Set(questions.map((question) => question.indicatorId)).size !== questions.length)
        throw new AssessmentError(409, "Dataset pre-test belum lengkap. Hubungi pengampu.");
      const id = crypto.randomUUID();
      await tx.assessmentAttempt.create({
        data: { id, studentId, courseId, kind, totalQuestions: questions.length },
      });
      await tx.assessmentItem.createMany({ data: questions.map((question, index) => {
        snapshot({ question: question.question, options: question.options,
          correctOption: question.correctOption });
        return { id: crypto.randomUUID(), attemptId: id, questionId: question.id,
          indicatorId: question.indicatorId, orderNumber: index + 1,
          questionSnapshot: { question: question.question, options: question.options,
            correctOption: question.correctOption, explanation: question.explanation,
            sourcePdf: question.sourcePdf, sourcePages: question.sourcePages } as Prisma.InputJsonValue };
      }) });
      return;
    }

    const pre = await tx.assessmentAttempt.findUnique({
      where: { studentId_courseId_kind: { studentId, courseId, kind: "PRE" } },
      include: { items: true },
    });
    if (pre?.status !== "SUBMITTED")
      throw new AssessmentError(409, "Selesaikan pre-test dahulu.");
    const progressRow = await tx.studentLearningProgress.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: { progressSnapshot: true },
    });
    const ready = (progressRow?.progressSnapshot as { posttestReady?: unknown } | null)
      ?.posttestReady === true;
    if (!ready)
      throw new AssessmentError(409, "Selesaikan pembelajaran indikator dahulu.");
    const id = crypto.randomUUID();
    await tx.assessmentAttempt.create({
      data: { id, studentId, courseId, kind, totalQuestions: pre.totalQuestions },
    });
    await tx.assessmentItem.createMany({ data: pre.items.map((item) => ({
      id: crypto.randomUUID(), attemptId: id, questionId: item.questionId,
      indicatorId: item.indicatorId, orderNumber: item.orderNumber,
      questionSnapshot: snapshot(item.questionSnapshot) as unknown as Prisma.InputJsonValue,
    })) });
  });
  return publicAttempt(studentId, courseId, kind);
}

export async function saveAssessmentAnswer(
  studentId: string, courseId: string, kind: Kind,
  attemptId: string, questionId: string, selectedOption: Option | null,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string; startedAt: Date }[]>`
      SELECT id,status,"startedAt" FROM assessment_attempt
      WHERE "studentId"=${studentId} AND "courseId"=${courseId} AND kind=${kind} FOR UPDATE
    `;
    const attempt = rows[0];
    if (!attempt || attempt.id !== attemptId) throw new AssessmentError(404, "Sesi tes tidak ditemukan.");
    if (attempt.status !== "IN_PROGRESS") throw new AssessmentError(409, "Tes sudah difinalisasi.");
    if (remainingSeconds(attempt.startedAt) === 0)
      throw new AssessmentError(409, "Waktu pengerjaan habis. Kirim hasil untuk melihat nilai.");
    const item = await tx.assessmentItem.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    if (!item) throw new AssessmentError(404, "Soal tidak berada dalam sesi ini.");
    const question = snapshot(item.questionSnapshot);
    if (selectedOption !== null && !question.options[selectedOption])
      throw new AssessmentError(422, "Pilihan tidak tersedia pada soal ini.");
    await tx.assessmentItem.update({
      where: { id: item.id }, data: { selectedOption,
        answeredAt: selectedOption === null ? null : new Date() },
    });
    return { saved: true, questionId, selectedOption };
  });
}

export async function submitAssessment(
  studentId: string, courseId: string, kind: Kind, attemptId: string,
) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string; startedAt: Date; totalQuestions: number }[]>`
      SELECT id,status,"startedAt","totalQuestions" FROM assessment_attempt
      WHERE "studentId"=${studentId} AND "courseId"=${courseId} AND kind=${kind} FOR UPDATE
    `;
    const attempt = rows[0];
    if (!attempt || attempt.id !== attemptId) throw new AssessmentError(404, "Sesi tes tidak ditemukan.");
    if (attempt.status === "SUBMITTED") return;
    const items = await tx.assessmentItem.findMany({
      where: { attemptId }, orderBy: { orderNumber: "asc" },
    });
    if (items.length !== attempt.totalQuestions || attempt.totalQuestions === 0
      || new Set(items.map((item) => item.indicatorId)).size !== attempt.totalQuestions)
      throw new AssessmentError(409, "Paket tes harus mencakup satu soal per indikator.");
    const expired = remainingSeconds(attempt.startedAt) === 0;
    if (!expired && items.some((item) => !letters.includes(item.selectedOption as Option)))
      throw new AssessmentError(409, "Lengkapi seluruh jawaban sebelum mengirim.");
    // Validasi snapshot sebelum perubahan apa pun; kunci tetap hanya dibaca di server.
    items.forEach((item) => snapshot(item.questionSnapshot));
    // Satu UPDATE menggantikan satu perjalanan database per soal. Nilai NULL pada
    // jawaban yang kosong karena waktu habis dinilai salah.
    const graded = await tx.$queryRaw<{ id: string; isCorrect: boolean }[]>`
      UPDATE assessment_item
      SET "isCorrect" = COALESCE(
        "selectedOption" = ("questionSnapshot"->>'correctOption'), false
      )
      WHERE "attemptId"=${attemptId}
      RETURNING id,"isCorrect"
    `;
    if (graded.length !== items.length)
      throw new AssessmentError(409, "Paket tes berubah saat penilaian. Coba kirim ulang.");
    const correctByItem = new Map(graded.map((item) => [item.id, item.isCorrect]));
    const correctCount = graded.filter((item) => item.isCorrect).length;
    if (kind === "PRE") {
      // Profil awal berasal dari hasil resmi soal; seluruh indikator disimpan
      // bersama-sama agar transaksi tidak kedaluwarsa pada database jarak jauh.
      await tx.studentIndicatorProfile.createMany({ data: items.map((item) => {
        const correct = correctByItem.get(item.id) === true;
        const status = correct ? "INITIAL_POSITIVE_EVIDENCE" : "NEEDS_REINFORCEMENT";
        return {
          id: crypto.randomUUID(), studentId, courseId, indicatorId: item.indicatorId,
          baselineItemId: item.id, initialScore: Number(correct), currentScore: Number(correct),
          initialStatus: status, currentStatus: status,
        };
      }) });
    }
    await tx.assessmentAttempt.update({ where: { id: attemptId }, data: {
      status: "SUBMITTED", submittedAt: new Date(), correctCount,
      percentage: correctCount / attempt.totalQuestions * 100,
    } });
  }, { maxWait: 10_000, timeout: 15_000 });
  return publicAttempt(studentId, courseId, kind);
}

export async function studentProfile(studentId: string, courseId: string) {
  const [course, config, attempt, topics, progress] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } }),
    prisma.courseLearningConfig.findUnique({ where: { courseId } }),
    publicAttempt(studentId, courseId, "PRE"),
    prisma.domainTopic.findMany({
      where: { courseId }, orderBy: { orderNumber: "asc" },
      include: { indicators: { orderBy: { code: "asc" },
        include: { concept: { select: { name: true } },
          profiles: { where: { studentId, courseId } } } } },
    }),
    readLearningProgress(studentId, courseId),
  ]);
  if (!config || !course)
    throw new AssessmentError(404, "Domain pembelajaran belum tersedia untuk mata kuliah ini.");
  const stages = new Map(progress.indicators.map((item) => [item.indicatorId, item]));
  const mappedTopics = topics.map((topic) => {
    const indicators = topic.indicators.map((indicator) => {
      const profile = indicator.profiles[0];
      const saved = stages.get(indicator.id);
      return {
        id: indicator.id, code: indicator.code, topicId: topic.id,
        description: indicator.description, concept: indicator.concept.name,
        subCpmkCodes: indicator.subCpmkCodes,
        initialScore: profile?.initialScore ?? null,
        currentScore: profile?.currentScore ?? null,
        evidenceCount: profile?.evidenceCount ?? 0,
        initialStatus: profile?.initialStatus ?? "NOT_ASSESSED",
        currentStatus: profile?.currentStatus ?? "NOT_ASSESSED",
        createdAt: profile?.createdAt ?? null,
        learning: saved ?? { indicatorId: indicator.id, indicatorCode: indicator.code,
          topicId: topic.id, initialScore: profile?.initialScore ?? null,
          currentScore: profile?.currentScore ?? null, lessonDelivered: false,
          completedQuestions: 0, requiredQuestions: 2, reviewRequired: false,
          reviewDone: false, stage: "NOT_STARTED" },
      };
    });
    const scores = indicators.map((indicator) => indicator.currentScore)
      .filter((score): score is number => score !== null);
    return {
      id: topic.id, code: topic.code, title: topic.title,
      orderNumber: topic.orderNumber, courseSessionId: topic.courseSessionId,
      cpmkCodes: topic.cpmkCodes, subCpmkCodes: topic.subCpmkCodes,
      sourcePdf: topic.sourcePdf, sourcePages: topic.sourcePages,
      initialPositiveCount: indicators.filter((indicator) => indicator.initialScore === 1).length,
      currentScore: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      indicators,
    };
  });
  const allIndicators = mappedTopics.flatMap((topic) => topic.indicators);
  return {
    course, attempt, totalQuestions: config.pretestQuestionCount, topics: mappedTopics,
    assessedCount: allIndicators.filter((item) => item.initialScore !== null).length,
    positiveCount: allIndicators.filter((item) => item.initialScore === 1).length,
    reinforcementCount: allIndicators.filter((item) => item.initialStatus === "NEEDS_REINFORCEMENT").length,
    learningProgress: {
      completedIndicators: progress.completedIndicators,
      totalIndicators: progress.totalIndicators,
      reviewPendingCount: progress.reviewPendingCount,
      nextIndicatorCode: progress.nextIndicatorCode,
    },
  };
}

export async function assessmentReview(studentId: string, courseId: string, kind: Kind) {
  const [attempt, post] = await Promise.all([
    attemptFor(studentId, courseId, kind),
    attemptFor(studentId, courseId, "POST"),
  ]);
  if (attempt?.status !== "SUBMITTED")
    throw new AssessmentError(409, "Selesaikan tes sebelum meninjau jawaban.");
  const answersRevealed = post?.status === "SUBMITTED";
  const items = await prisma.assessmentItem.findMany({
    where: { attemptId: attempt.id }, orderBy: { orderNumber: "asc" },
    include: { indicator: { include: { topic: { select: { title: true } } } } },
  });
  return {
    kind, totalQuestions: attempt.totalQuestions, correctCount: attempt.correctCount,
    answersRevealed,
    questions: items.map((item) => {
      const question = snapshot(item.questionSnapshot);
      return {
        number: item.orderNumber, question: question.question, options: question.options,
        selectedOption: item.selectedOption,
        isCorrect: answersRevealed ? item.isCorrect : null,
        correctOption: answersRevealed ? question.correctOption : null,
        explanation: answersRevealed ? question.explanation : null,
        topicTitle: item.indicator.topic.title,
      };
    }),
  };
}

export async function assessmentComparison(studentId: string, courseId: string) {
  const attempts = await prisma.assessmentAttempt.findMany({
    where: { studentId, courseId },
    include: { items: { include: { indicator: { include: { topic: true } } } } },
  });
  const pre = attempts.find((attempt) => attempt.kind === "PRE") ?? null;
  const post = attempts.find((attempt) => attempt.kind === "POST") ?? null;
  const score = (attempt: typeof pre) => attempt && ({
    id: attempt.id, kind: attempt.kind, status: attempt.status,
    correctCount: attempt.correctCount, totalQuestions: attempt.totalQuestions,
    percentage: attempt.percentage, submittedAt: attempt.submittedAt,
  });
  const completed = pre?.status === "SUBMITTED" && post?.status === "SUBMITTED";
  if (!completed || !pre || !post)
    return { pretest: score(pre), posttest: score(post), completed: false,
      delta: null, topics: [] };
  const preAnswers = new Map(pre.items.map((item) => [item.indicatorId, item.isCorrect]));
  const topics = new Map<string, { id: string; code: string; title: string;
    preCorrect: number; postCorrect: number; indicators: {
      id: string; code: string; description: string;
      preCorrect: boolean | null; postCorrect: boolean | null;
    }[] }>();
  for (const item of post.items.sort((a, b) =>
    a.indicator.topic.orderNumber - b.indicator.topic.orderNumber ||
    a.indicator.code.localeCompare(b.indicator.code))) {
    const topic = item.indicator.topic;
    if (!topics.has(topic.id)) topics.set(topic.id, {
      id: topic.id, code: topic.code, title: topic.title,
      preCorrect: 0, postCorrect: 0, indicators: [],
    });
    const result = topics.get(topic.id)!;
    const preCorrect = preAnswers.get(item.indicatorId) ?? null;
    result.indicators.push({ id: item.indicator.id, code: item.indicator.code,
      description: item.indicator.description, preCorrect, postCorrect: item.isCorrect });
    result.preCorrect += Number(preCorrect === true);
    result.postCorrect += Number(item.isCorrect === true);
  }
  return { pretest: score(pre), posttest: score(post), completed: true,
    delta: (post.percentage ?? 0) - (pre.percentage ?? 0), topics: [...topics.values()] };
}
