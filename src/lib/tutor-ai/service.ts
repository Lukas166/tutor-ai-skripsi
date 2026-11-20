import type { Prisma } from "@/app/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  preparePythonRag,
  recordPythonStudy,
  generatePythonAnswer,
  streamPythonAnswer,
  getPythonAvatarExpression,
  type RetrievedChunk,
} from "@/lib/rag/python-client";

type AcademicLevel = "S1" | "S2" | "S3";
type TutorResponseMode = "chat" | "avatar";
type AvatarExpression = "neutral" | "happy" | "concerned";

type TutorUser = {
  id: string;
  name: string;
  role: string;
  academicLevel: string | null;
};

type TutorCourse = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
};

type ReadyMaterial = {
  id: string;
  title: string;
  fileName: string;
  sessionId: string;
  sessionTitle: string;
  pageCount: number;
  chunkCount: number;
  createdAt: string;
};

type RagSource = {
  chunkId: string;
  materialId: string;
  materialTitle: string;
  fileName: string;
  sessionTitle: string;
  pageNumber: number;
  chunkIndex: number;
  similarity: number;
  snippet: string;
};

const CONTEXT_MESSAGE_TYPE = "context";
const VISIBLE_SENDER_TYPES = ["user", "ai"];
const MAX_HISTORY_MESSAGES = 8;

export class TutorAiServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "TutorAiServiceError";
  }
}

function normalizeAcademicLevel(level: string | null): AcademicLevel {
  if (level === "S2" || level === "S3") return level;
  return "S1";
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function parseSelectedMaterialIds(content: string | null | undefined, readyMaterialIds: string[]) {
  if (!content) return readyMaterialIds;

  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return readyMaterialIds;

    const readySet = new Set(readyMaterialIds);
    return uniqueIds(parsed.filter((item): item is string => typeof item === "string")).filter((id) =>
      readySet.has(id)
    );
  } catch {
    return readyMaterialIds;
  }
}

function serializeMessage(message: {
  id: string;
  senderType: string;
  content: string;
  ragSources: Prisma.JsonValue | null;
  responseTimeMs: number | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    senderType: message.senderType,
    content: message.content,
    ragSources: message.ragSources,
    responseTimeMs: message.responseTimeMs,
    createdAt: message.createdAt.toISOString(),
  };
}

function serializeSessionSummary(session: {
  id: string;
  customTitle: string | null;
  startedAt: Date;
  lastActiveAt: Date;
  messages: { senderType: string; content: string }[];
  messageCount: number;
}) {
  const firstUserMessage = session.messages.find((message) => message.senderType === "user");

  return {
    id: session.id,
    startedAt: session.startedAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    messageCount: session.messageCount,
    title: session.customTitle || firstUserMessage?.content.slice(0, 72) || "New Chat",
  };
}

function toReadyMaterial(material: {
  id: string;
  title: string;
  fileName: string;
  pageCount: number;
  chunkCount: number;
  createdAt: Date;
  courseSession: { id: string; title: string };
}): ReadyMaterial {
  return {
    id: material.id,
    title: material.title,
    fileName: material.fileName,
    sessionId: material.courseSession.id,
    sessionTitle: material.courseSession.title,
    pageCount: material.pageCount,
    chunkCount: material.chunkCount,
    createdAt: material.createdAt.toISOString(),
  };
}

async function getTutorAccess(courseId: string, userId: string, allowPretest = false) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, academicLevel: true },
  });

  if (!user) {
    throw new TutorAiServiceError("Unauthorized", 401);
  }

  if (user.role !== "mahasiswa") {
    throw new TutorAiServiceError("Tutor AI course hanya tersedia untuk mahasiswa.", 403);
  }

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      isActive: true,
      enrollments: { some: { userId, isActive: true } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      isActive: true,
    },
  });

  if (!course) {
    throw new TutorAiServiceError("Course tidak ditemukan atau Anda belum enroll.", 404);
  }

  if (!allowPretest && await needsPretest(courseId, userId)) {
    throw new TutorAiServiceError("Selesaikan pre-test sebelum membuka AI Tutor.", 409);
  }

  return { user: user as TutorUser, course };
}

export async function requireTutorCourseAccess(courseId: string, userId: string) {
  await getTutorAccess(courseId, userId);
}

async function listReadyMaterialsForCourse(courseId: string) {
  const materials = await prisma.material.findMany({
    where: {
      isActive: true,
      isProcessed: true,
      processingStatus: "ready",
      materialType: "file",
      chunkCount: { gt: 0 },
      courseSession: {
        courseId,
        isActive: true,
      },
    },
    select: {
      id: true,
      title: true,
      fileName: true,
      pageCount: true,
      chunkCount: true,
      createdAt: true,
      courseSession: { select: { id: true, title: true, orderNumber: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return materials
    .sort((a, b) => {
      const bySession = a.courseSession.orderNumber - b.courseSession.orderNumber;
      return bySession || a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map(toReadyMaterial);
}

async function needsPretest(courseId: string, userId: string) {
  const config = await prisma.courseLearningConfig.findUnique({ where: { courseId }, select: { courseId: true } });
  if (!config) return false;
  const pretest = await prisma.assessmentAttempt.findUnique({
    where: { studentId_courseId_kind: { studentId: userId, courseId, kind: "PRE" } },
    select: { status: true },
  });
  return pretest?.status !== "SUBMITTED";
}

async function getCourseAnchorSessionId(courseId: string) {
  const session = await prisma.courseSession.findFirst({
    where: { courseId, isActive: true },
    select: { id: true },
    orderBy: { orderNumber: "asc" },
  });

  if (!session) {
    throw new TutorAiServiceError("Course ini belum memiliki sesi aktif untuk Tutor AI.", 400);
  }

  return session.id;
}

async function getSessionOrThrow(input: {
  courseId: string;
  userId: string;
  sessionId: string;
}) {
  const session = await prisma.aiChatSession.findFirst({
    where: {
      id: input.sessionId,
      userId: input.userId,
      courseId: input.courseId,
    },
    include: {
      messages: {
        where: { senderType: { in: VISIBLE_SENDER_TYPES } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          senderType: true,
          content: true,
          ragSources: true,
          responseTimeMs: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new TutorAiServiceError("Chat session tidak ditemukan.", 404);
  }

  return session;
}

async function getStoredSelectedMaterialIds(sessionId: string, readyMaterialIds: string[]) {
  const contextMessage = await prisma.aiChatMessage.findFirst({
    where: { aiChatSessionId: sessionId, senderType: CONTEXT_MESSAGE_TYPE },
    select: { content: true },
    orderBy: { createdAt: "desc" },
  });

  return parseSelectedMaterialIds(contextMessage?.content, readyMaterialIds);
}

async function persistSelectedMaterialIds(sessionId: string, selectedMaterialIds: string[]) {
  const existingContextMessage = await prisma.aiChatMessage.findFirst({
    where: { aiChatSessionId: sessionId, senderType: CONTEXT_MESSAGE_TYPE },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  const content = JSON.stringify(selectedMaterialIds);

  if (existingContextMessage) {
    await prisma.aiChatMessage.update({
      where: { id: existingContextMessage.id },
      data: { content },
    });
    return;
  }

  await prisma.aiChatMessage.create({
    data: {
      id: crypto.randomUUID(),
      aiChatSessionId: sessionId,
      senderType: CONTEXT_MESSAGE_TYPE,
      content,
    },
  });
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function toRagSource(chunk: RetrievedChunk): RagSource {
  return {
    chunkId: chunk.chunkId,
    materialId: chunk.materialId,
    materialTitle: chunk.materialTitle,
    fileName: chunk.fileName,
    sessionTitle: chunk.sessionTitle,
    pageNumber: chunk.pageNumber,
    chunkIndex: chunk.chunkIndex,
    similarity: Number(chunk.similarity),
    snippet: truncateText(chunk.content.replace(/\s+/g, " ").trim(), 260),
  };
}

const LATEX_SPOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\\left|\\right/g, ""],
  [/\\cdot|\\times/g, " kali "],
  [/\\div/g, " dibagi "],
  [/\\pm/g, " plus atau minus "],
  [/\\leq?|≤/g, " kurang dari atau sama dengan "],
  [/\\geq?|≥/g, " lebih dari atau sama dengan "],
  [/\\neq|≠/g, " tidak sama dengan "],
  [/\\approx|≈/g, " kira-kira sama dengan "],
  [/\\infty|∞/g, " tak hingga "],
  [/\\pi|π/g, " pi "],
  [/\\alpha|α/g, " alfa "],
  [/\\beta|β/g, " beta "],
  [/\\gamma|γ/g, " gamma "],
  [/\\delta|δ/g, " delta "],
  [/\\theta|θ/g, " teta "],
  [/\\lambda|λ/g, " lambda "],
  [/\\mu|μ/g, " miu "],
  [/\\sigma|σ/g, " sigma "],
  [/\\omega|ω/g, " omega "],
];

function replaceNestedLatex(
  value: string,
  pattern: RegExp,
  replacement: (...groups: string[]) => string
) {
  let result = value;

  for (let index = 0; index < 8; index += 1) {
    let replaced = false;
    result = result.replace(pattern, (...args: unknown[]) => {
      replaced = true;
      const groups = args.slice(1, -2).map(String);
      return replacement(...groups);
    });
    if (!replaced) break;
  }

  return result;
}

function verbalizeMathExpression(expression: string): string {
  let spoken = expression.trim();

  spoken = replaceNestedLatex(
    spoken,
    /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
    (numerator, denominator) =>
      `${verbalizeMathExpression(numerator)} dibagi ${verbalizeMathExpression(denominator)}`
  );
  spoken = replaceNestedLatex(
    spoken,
    /\\sqrt\s*\[([^\[\]]+)\]\s*\{([^{}]*)\}/g,
    (degree, value) =>
      `akar pangkat ${verbalizeMathExpression(degree)} dari ${verbalizeMathExpression(value)}`
  );
  spoken = replaceNestedLatex(
    spoken,
    /\\sqrt\s*\{([^{}]*)\}/g,
    (value) => `akar dari ${verbalizeMathExpression(value)}`
  );

  spoken = spoken
    .replace(
      /\\sum\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}/g,
      (_, from: string, to: string) =>
        `jumlah dari ${verbalizeMathExpression(from)} sampai ${verbalizeMathExpression(to)}`
    )
    .replace(
      /\\int\s*_\{([^{}]+)\}\s*\^\{([^{}]+)\}/g,
      (_, from: string, to: string) =>
        `integral dari ${verbalizeMathExpression(from)} sampai ${verbalizeMathExpression(to)}`
    )
    .replace(/\\sum/g, " jumlah ")
    .replace(/\\int/g, " integral ")
    .replace(/\\text\s*\{([^{}]*)\}/g, " $1 ")
    .replace(/\^\{([^{}]+)\}/g, (_, power: string) => ` pangkat ${power} `)
    .replace(/\^(-?\d+|[a-zA-Z])/g, " pangkat $1 ")
    .replace(/_\{([^{}]+)\}/g, (_, index: string) => ` indeks ${index} `)
    .replace(/_(-?\d+|[a-zA-Z])/g, " indeks $1 ");

  for (const [pattern, replacement] of LATEX_SPOKEN_REPLACEMENTS) {
    spoken = spoken.replace(pattern, replacement);
  }

  return spoken
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\(/g, " buka kurung ")
    .replace(/\)/g, " tutup kurung ")
    .replace(/=/g, " sama dengan ")
    .replace(/\+/g, " ditambah ")
    .replace(/−|-/g, " dikurangi ")
    .replace(/\*/g, " kali ")
    .replace(/\//g, " dibagi ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAvatarSpokenText(answer: string) {
  return answer
    .replace(/```[\s\S]*?```/g, "Bagian kode dapat dilihat pada layar.")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, formula: string) =>
      verbalizeMathExpression(formula)
    )
    .replace(/\$([^$\n]+)\$/g, (_, formula: string) =>
      verbalizeMathExpression(formula)
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[(.*?)\]\((.*?)\)/g, "Gambar dapat dilihat pada layar.")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_#>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAvatarRagSources(
  chunks: RetrievedChunk[],
  avatarExpression: AvatarExpression,
  responseMode: TutorResponseMode,
  reason?: string,
  spokenText?: string,
  adaptive?: Prisma.InputJsonValue | null
) {
  return {
    avatarExpression,
    responseMode,
    reason: reason ?? null,
    sources: chunks.map(toRagSource),
    spokenText: spokenText ? buildAvatarSpokenText(spokenText) : null,
    adaptive: adaptive ?? null,
  };
}

async function prepareTutorAnswer(input: {
  course: TutorCourse;
  user: TutorUser;
  question: string;
  sessionId: string;
  userMessageId: string;
  selectedMaterialIds: string[];
  readyMaterials: ReadyMaterial[];
  responseMode: TutorResponseMode;
  signal?: AbortSignal;
}) {
  const history = await prisma.aiChatMessage.findMany({
    where: {
      aiChatSessionId: input.sessionId,
      senderType: { in: VISIBLE_SENDER_TYPES },
      id: { not: input.userMessageId },
    },
    select: { senderType: true, content: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
  });
  const activeMaterials = input.readyMaterials.filter((m) => input.selectedMaterialIds.includes(m.id));
  const chronologicalHistory = history.reverse();

  // Only authorized course/material context crosses the internal service boundary.
  return preparePythonRag({
    course: input.course,
    user: input.user,
    chatSessionId: input.sessionId,
    question: input.question,
    selectedMaterialIds: input.selectedMaterialIds,
    activeMaterials,
    history: chronologicalHistory,
    responseMode: input.responseMode,
  }, input.signal);
}

async function createAiMessage(input: {
  aiChatSessionId: string;
  content: string;
  ragSources: Prisma.InputJsonValue;
  responseTimeMs?: number;
}) {
  const message = await prisma.aiChatMessage.create({
    data: {
      id: crypto.randomUUID(),
      aiChatSessionId: input.aiChatSessionId,
      senderType: "ai",
      content: input.content,
      ragSources: input.ragSources,
      responseTimeMs: input.responseTimeMs ?? null,
    },
  });
  const metadata = input.ragSources as { adaptive?: unknown; sources?: unknown[] };
  if (metadata.adaptive && metadata.sources?.length) {
    const session = await prisma.aiChatSession.findUniqueOrThrow({
      where: { id: input.aiChatSessionId }, select: { userId: true, courseId: true },
    });
    await recordPythonStudy({ studentId: session.userId, courseId: session.courseId,
      chatSessionId: input.aiChatSessionId, messageId: message.id });
  }
  return message;
}

const welcomeJobs = new Map<string, Promise<void>>();

async function findTutorWelcome(courseId: string, userId: string) {
  return prisma.aiChatMessage.findFirst({
    where: {
      senderType: "ai",
      ragSources: { path: ["welcome"], equals: true },
      aiChatSession: { courseId, userId },
    },
    select: { id: true, aiChatSessionId: true, content: true },
    orderBy: { createdAt: "asc" },
  });
}

async function welcomeIndicatorCodes(courseId: string, userId: string) {
  const profiles = await prisma.studentIndicatorProfile.findMany({
    where: { courseId, studentId: userId },
    select: { indicator: { select: { code: true } } },
  });
  return profiles.map((profile) => profile.indicator.code);
}

function coversIndicators(answer: string, codes: string[]) {
  return !!answer.trim() && codes.length > 0 && codes.every((code) => answer.includes(code));
}

export async function ensureTutorWelcomeSession(courseId: string, userId: string) {
  const existing = await findTutorWelcome(courseId, userId);
  if (existing) return existing;
  await getTutorAccess(courseId, userId);
  const profileCount = await prisma.studentIndicatorProfile.count({
    where: { courseId, studentId: userId },
  });
  if (!profileCount) throw new TutorAiServiceError("Student Profile awal belum tersedia.", 409);

  const sessionId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const courseSessionId = await getCourseAnchorSessionId(courseId);
  // Sesi dan pesan kosong tercatat lebih dulu agar LMS dapat menampilkan loading
  // di tempat balasan Tutor AI, tanpa menunggu generasi LLM selesai.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM assessment_attempt WHERE "studentId"=${userId} AND "courseId"=${courseId} AND kind='PRE' FOR UPDATE`;
    const found = await tx.aiChatMessage.findFirst({
      where: { senderType: "ai", ragSources: { path: ["welcome"], equals: true },
        aiChatSession: { courseId, userId } },
      select: { id: true, aiChatSessionId: true, content: true },
    });
    if (found) return found;
    await tx.aiChatSession.create({
      data: { id: sessionId, userId, courseId, courseSessionId,
        customTitle: "Rencana belajar awal" },
    });
    return tx.aiChatMessage.create({
      data: { id: messageId, aiChatSessionId: sessionId, senderType: "ai",
        content: "", ragSources: { welcome: true, pending: true } },
      select: { id: true, aiChatSessionId: true, content: true },
    });
  });
}

async function createTutorWelcome(courseId: string, userId: string) {
  const marker = await ensureTutorWelcomeSession(courseId, userId);
  const knownCodes = await welcomeIndicatorCodes(courseId, userId);
  if (coversIndicators(marker.content, knownCodes)) return;
  const { course, user } = await getTutorAccess(courseId, userId);

  const readyMaterials = await listReadyMaterialsForCourse(courseId);
  // LLM melengkapi pesan yang sudah terlihat sebagai balasan sedang diproses.
  const prepared = await preparePythonRag({
    course, user, purpose: "welcome",
    question: "Mulai pembelajaran terpandu dari hasil pre-test dan Student Profile awal.",
    selectedMaterialIds: readyMaterials.map((material) => material.id),
    activeMaterials: readyMaterials, history: [], responseMode: "chat",
  });
  const requiredCodes = prepared.adaptive?.requiredWelcomeCodes ?? knownCodes;
  let answer = await generatePythonAnswer(prepared);
  if (!coversIndicators(answer, requiredCodes)) {
    // Model mendapat kesempatan memperbaiki daftar yang terpotong tanpa teks buatan server.
    answer = await generatePythonAnswer({
      systemInstruction: prepared.systemInstruction +
        `\nRespons sebelumnya belum mencakup seluruh indikator. Tulis ulang jawaban lengkap dan sebut setiap kode berikut tepat sekali: ${requiredCodes.join(", ")}.`,
      prompt: prepared.prompt,
    });
  }
  if (!coversIndicators(answer, requiredCodes))
    throw new Error("Tutor AI belum mencakup seluruh indikator Student Profile.");
  const metadata = {
    ...buildAvatarRagSources(prepared.chunks, "neutral", "chat", undefined, undefined,
      prepared.adaptive as Prisma.InputJsonValue | null),
    welcome: true,
  };
  // Hanya worker pertama yang berhasil mengisi pesan pending; tetap satu pembukaan.
  await prisma.aiChatMessage.updateMany({
    where: { id: marker.id },
    data: { content: answer, ragSources: metadata },
  });
}

export async function prepareTutorWelcome(courseId: string, userId: string) {
  const key = `${courseId}:${userId}`;
  const existing = welcomeJobs.get(key);
  if (existing) return existing;
  const job = createTutorWelcome(courseId, userId).finally(() => welcomeJobs.delete(key));
  welcomeJobs.set(key, job);
  return job;
}

const practiceFollowupJobs = new Map<string, Promise<void>>();

export async function ensurePracticeFollowup(input: {
  courseId: string; userId: string; practiceId: string; requestId: string;
}) {
  const practice = await prisma.practiceSession.findUnique({
    where: { id: input.practiceId },
    select: { courseId: true, studentId: true, chatSessionId: true },
  });
  if (!practice?.chatSessionId || practice.courseId !== input.courseId
    || practice.studentId !== input.userId) return null;
  const event = await prisma.practiceEvent.findUnique({
    where: { practiceSessionId_requestId: {
      practiceSessionId: input.practiceId, requestId: input.requestId,
    } },
    select: { id: true, kind: true },
  });
  if (!event || event.kind !== "ANSWER") return null;
  const existing = await prisma.aiChatMessage.findFirst({
    where: { aiChatSessionId: practice.chatSessionId,
      ragSources: { path: ["practiceEventId"], equals: event.id } },
    select: { id: true },
  });
  if (existing) return { eventId: event.id, chatSessionId: practice.chatSessionId };

  await prisma.$transaction(async (tx) => {
    // Kunci event agar retry HTTP tidak membuat dua balasan untuk jawaban yang sama.
    await tx.$queryRaw`SELECT id FROM practice_event WHERE id=${event.id} FOR UPDATE`;
    const found = await tx.aiChatMessage.findFirst({
      where: { aiChatSessionId: practice.chatSessionId!,
        ragSources: { path: ["practiceEventId"], equals: event.id } },
      select: { id: true },
    });
    if (found) return;
    await tx.aiChatMessage.create({
      data: { id: crypto.randomUUID(), aiChatSessionId: practice.chatSessionId!,
        senderType: "ai", content: "",
        ragSources: { practiceEventId: event.id, pending: true } },
    });
  });
  return { eventId: event.id, chatSessionId: practice.chatSessionId };
}

async function createPracticeFollowup(courseId: string, userId: string, eventId: string) {
  const event = await prisma.practiceEvent.findUnique({
    where: { id: eventId },
    select: { practiceSession: { select: {
      studentId: true, courseId: true, chatSessionId: true,
    } } },
  });
  const practice = event?.practiceSession;
  if (!practice?.chatSessionId || practice.studentId !== userId || practice.courseId !== courseId)
    return;
  const pending = await prisma.aiChatMessage.findFirst({
    where: { aiChatSessionId: practice.chatSessionId,
      ragSources: { path: ["practiceEventId"], equals: eventId } },
    select: { id: true, content: true },
  });
  if (!pending || pending.content.trim()) return;

  const { course, user } = await getTutorAccess(courseId, userId);
  const [readyMaterials, history, lastAiMessage] = await Promise.all([
    listReadyMaterialsForCourse(courseId),
    prisma.aiChatMessage.findMany({
      where: { aiChatSessionId: practice.chatSessionId,
        senderType: { in: VISIBLE_SENDER_TYPES }, content: { not: "" } },
      select: { senderType: true, content: true },
      orderBy: { createdAt: "desc" }, take: MAX_HISTORY_MESSAGES,
    }),
    prisma.aiChatMessage.findFirst({
      where: { aiChatSessionId: practice.chatSessionId,
        senderType: "ai", content: { not: "" } },
      select: { ragSources: true }, orderBy: { createdAt: "desc" },
    }),
  ]);
  const responseMode = (
    lastAiMessage?.ragSources as { responseMode?: string } | null
  )?.responseMode === "avatar" ? "avatar" : "chat";
  const prepared = await preparePythonRag({
    course, user, purpose: "practice_followup", practiceEventId: eventId,
    chatSessionId: practice.chatSessionId,
    question: "Berikan tanggapan singkat atas jawaban latihan dan arah belajar berikutnya.",
    selectedMaterialIds: readyMaterials.map((material) => material.id),
    activeMaterials: readyMaterials, history: history.reverse(), responseMode,
  });
  const answer = await generatePythonAnswer(prepared);
  const avatarExpression = await getPythonAvatarExpression({
    answer, question: "Tanggapan atas hasil latihan", responseMode,
  });
  const metadata = {
    ...buildAvatarRagSources(prepared.chunks, avatarExpression, responseMode,
      undefined, responseMode === "avatar" ? answer : undefined,
      prepared.adaptive as Prisma.InputJsonValue | null),
    practiceEventId: eventId,
  };
  await prisma.aiChatMessage.updateMany({
    where: { id: pending.id, content: "" },
    data: { content: answer, ragSources: metadata },
  });
  await prisma.aiChatSession.update({
    where: { id: practice.chatSessionId }, data: { lastActiveAt: new Date() },
  });
}

export async function preparePracticeFollowup(courseId: string, userId: string, eventId: string) {
  const existing = practiceFollowupJobs.get(eventId);
  if (existing) return existing;
  const job = createPracticeFollowup(courseId, userId, eventId)
    .finally(() => practiceFollowupJobs.delete(eventId));
  practiceFollowupJobs.set(eventId, job);
  return job;
}

export async function getTutorOverview(courseId: string, userId: string) {
  const { user, course } = await getTutorAccess(courseId, userId, true);
  const pretestRequired = await needsPretest(courseId, userId);
  let readyMaterials: Awaited<ReturnType<typeof listReadyMaterialsForCourse>> = [];
  let chatSessions: Awaited<ReturnType<typeof listTutorChatSessions>> = [];
  let welcomeSessionId: string | null = null;
  let welcomePending = false;
  if (!pretestRequired) {
    const config = await prisma.courseLearningConfig.findUnique({
      where: { courseId }, select: { courseId: true },
    });
    if (config) {
      const welcome = await ensureTutorWelcomeSession(courseId, userId);
      welcomeSessionId = welcome.aiChatSessionId;
      welcomePending = !coversIndicators(
        welcome.content, await welcomeIndicatorCodes(courseId, userId)
      );
    }
    [readyMaterials, chatSessions] = await Promise.all([
      listReadyMaterialsForCourse(courseId), listTutorChatSessions(courseId, userId),
    ]);
  }

  return {
    course,
    user: { id: user.id, name: user.name,
      academicLevel: normalizeAcademicLevel(user.academicLevel), role: user.role },
    readyMaterials, chatSessions, welcomeSessionId, welcomePending, pretestRequired,
  };
}

export async function listTutorChatSessions(courseId: string, userId: string) {
  await getTutorAccess(courseId, userId);

  const sessions = await prisma.aiChatSession.findMany({
    where: { userId, courseId },
    select: {
      id: true,
      customTitle: true,
      startedAt: true,
      lastActiveAt: true,
      messages: {
        where: { senderType: "user" },
        orderBy: { createdAt: "asc" },
        select: { senderType: true, content: true },
        take: 1,
      },
    },
    orderBy: { lastActiveAt: "desc" },
  });

  const counts = await prisma.aiChatMessage.groupBy({
    by: ["aiChatSessionId"],
    where: {
      aiChatSessionId: { in: sessions.map((session) => session.id) },
      senderType: { in: VISIBLE_SENDER_TYPES },
    },
    _count: { _all: true },
  });
  const countBySessionId = new Map(
    counts.map((count) => [count.aiChatSessionId, count._count._all])
  );

  return sessions.map((session) =>
    serializeSessionSummary({
      ...session,
      messageCount: countBySessionId.get(session.id) ?? 0,
    })
  );
}

export async function renameTutorChatSession(input: {
  courseId: string;
  userId: string;
  sessionId: string;
  title: string;
}) {
  await getTutorAccess(input.courseId, input.userId);
  await getSessionOrThrow(input);

  const trimmed = input.title.trim().slice(0, 120);
  if (!trimmed) {
    throw new TutorAiServiceError("Judul tidak boleh kosong.", 400);
  }

  await prisma.aiChatSession.update({
    where: { id: input.sessionId },
    data: { customTitle: trimmed },
  });

  return { success: true };
}

export async function deleteTutorChatSession(input: {
  courseId: string;
  userId: string;
  sessionId: string;
}) {
  await getTutorAccess(input.courseId, input.userId);
  await getSessionOrThrow(input);

  // Messages cascade-delete via onDelete: Cascade in schema
  await prisma.aiChatSession.delete({
    where: { id: input.sessionId },
  });

  return { success: true };
}

export async function createTutorChatSession(courseId: string, userId: string) {
  await getTutorAccess(courseId, userId);
  const [readyMaterials, courseSessionId] = await Promise.all([
    listReadyMaterialsForCourse(courseId),
    getCourseAnchorSessionId(courseId),
  ]);
  const selectedMaterialIds = readyMaterials.map((material) => material.id);

  const session = await prisma.aiChatSession.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      courseId,
      courseSessionId,
    },
  });
  await persistSelectedMaterialIds(session.id, selectedMaterialIds);

  return getTutorChatSession({ courseId, userId, sessionId: session.id });
}

export async function getTutorChatSession(input: {
  courseId: string;
  userId: string;
  sessionId: string;
}) {
  await getTutorAccess(input.courseId, input.userId);
  const [session, readyMaterials] = await Promise.all([
    getSessionOrThrow(input),
    listReadyMaterialsForCourse(input.courseId),
  ]);

  const selectedMaterialIds = await getStoredSelectedMaterialIds(
    session.id,
    readyMaterials.map((material) => material.id)
  );

  return {
    id: session.id,
    courseId: session.courseId,
    selectedMaterialIds,
    startedAt: session.startedAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
    messages: session.messages.map(serializeMessage),
  };
}

export async function updateTutorSessionContext(input: {
  courseId: string;
  userId: string;
  sessionId: string;
  selectedMaterialIds: string[];
}) {
  await getTutorAccess(input.courseId, input.userId);
  const session = await getSessionOrThrow(input);

  const readyMaterials = await listReadyMaterialsForCourse(input.courseId);
  const readySet = new Set(readyMaterials.map((material) => material.id));
  const selectedMaterialIds = uniqueIds(input.selectedMaterialIds).filter((id) => readySet.has(id));

  await persistSelectedMaterialIds(session.id, selectedMaterialIds);
  await prisma.aiChatSession.update({
    where: { id: input.sessionId },
    data: { lastActiveAt: new Date() },
  });

  return getTutorChatSession(input);
}

export async function askTutor(input: {
  courseId: string;
  userId: string;
  sessionId: string;
  content: string;
  responseMode?: TutorResponseMode;
}) {
  const startTime = Date.now();
  const question = input.content.trim();
  const responseMode = input.responseMode ?? "chat";
  if (!question) {
    throw new TutorAiServiceError("Pertanyaan tidak boleh kosong.", 400);
  }

  const { user, course } = await getTutorAccess(input.courseId, input.userId);
  if (await needsPretest(input.courseId, input.userId))
    throw new TutorAiServiceError("Selesaikan pre-test pada halaman mata kuliah sebelum belajar di tutor.", 409);
  const [session, readyMaterials] = await Promise.all([
    getSessionOrThrow(input),
    listReadyMaterialsForCourse(input.courseId),
  ]);

  const readyMaterialIds = readyMaterials.map((material) => material.id);
  const selectedMaterialIds = await getStoredSelectedMaterialIds(session.id, readyMaterialIds);

  const userMessage = await prisma.aiChatMessage.create({
    data: {
      id: crypto.randomUUID(),
      aiChatSessionId: input.sessionId,
      senderType: "user",
      content: question,
    },
  });

  let answer: string;
  let chunks: RetrievedChunk[];
  let adaptive: Prisma.InputJsonValue | null = null;
  
  try {
    const prepared = await prepareTutorAnswer({
      course, user, question, sessionId: input.sessionId, userMessageId: userMessage.id,
      selectedMaterialIds, readyMaterials, responseMode,
    });
    chunks = prepared.chunks;
    adaptive = prepared.adaptive ?? null;
    answer = await generatePythonAnswer(prepared);
  } catch (error) {
    // Hapus pesan user yang terlanjur disimpan jika ADA step yang gagal (embedding, RAG, atau chat)
    await prisma.aiChatMessage.delete({ where: { id: userMessage.id } });
    throw error;
  }

  const avatarExpression = await getPythonAvatarExpression({
    answer,
    question,
    responseMode,
  });

  await createAiMessage({
    aiChatSessionId: input.sessionId,
    content: answer,
    ragSources: buildAvatarRagSources(
      chunks,
      avatarExpression,
      responseMode,
      undefined,
      responseMode === "avatar" ? answer : undefined,
      adaptive
    ),
    responseTimeMs: Date.now() - startTime,
  });
  await prisma.aiChatSession.update({
    where: { id: input.sessionId },
    data: { lastActiveAt: new Date() },
  });

  return getTutorChatSession(input);
}

export async function askTutorStream(input: {
  courseId: string;
  userId: string;
  sessionId: string;
  content: string;
  responseMode?: TutorResponseMode;
  signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const startTime = Date.now();
  const question = input.content.trim();
  const responseMode = input.responseMode ?? "chat";
  if (!question) {
    throw new TutorAiServiceError("Pertanyaan tidak boleh kosong.", 400);
  }

  const { user, course } = await getTutorAccess(input.courseId, input.userId);
  if (await needsPretest(input.courseId, input.userId))
    throw new TutorAiServiceError("Selesaikan pre-test pada halaman mata kuliah sebelum belajar di tutor.", 409);
  const [session, readyMaterials] = await Promise.all([
    getSessionOrThrow(input),
    listReadyMaterialsForCourse(input.courseId),
  ]);

  const readyMaterialIds = readyMaterials.map((material) => material.id);
  const selectedMaterialIds = await getStoredSelectedMaterialIds(session.id, readyMaterialIds);

  const userMessage = await prisma.aiChatMessage.create({
    data: {
      id: crypto.randomUUID(),
      aiChatSessionId: input.sessionId,
      senderType: "user",
      content: question,
    },
  });

  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function throwIfAborted() {
    if (input.signal?.aborted) {
      throw new DOMException("Tutor AI request aborted", "AbortError");
    }
  }

  function isAbortError(error: unknown) {
    return (
      input.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    );
  }

  // --- Embedding + RAG retrieval (same as askTutor) ---
  let chunks: RetrievedChunk[];
  let systemInstruction: string;
  let prompt: string;
  let adaptive: Prisma.InputJsonValue | null = null;

  try {
    throwIfAborted();
    const prepared = await prepareTutorAnswer({
      course, user, question, sessionId: input.sessionId, userMessageId: userMessage.id,
      selectedMaterialIds, readyMaterials, responseMode, signal: input.signal,
    });
    chunks = prepared.chunks;
    systemInstruction = prepared.systemInstruction;
    prompt = prepared.prompt;
    adaptive = prepared.adaptive ?? null;
    throwIfAborted();
  } catch (error) {
    await prisma.aiChatMessage.delete({ where: { id: userMessage.id } });
    throw error;
  }

  // --- Stream the LLM response ---
  const capturedChunks = chunks;
  return new ReadableStream({
    async start(controller) {
      let fullAnswer = "";
      let closed = false;
      const closeStream = () => {
        if (!closed) {
          controller.close();
          closed = true;
        }
      };
      const abortHandler = () => {
        closeStream();
      };
      input.signal?.addEventListener("abort", abortHandler, { once: true });

      try {
        throwIfAborted();
        const stream = streamPythonAnswer({ systemInstruction, prompt, signal: input.signal });
        for await (const textChunk of stream) {
          throwIfAborted();
          fullAnswer += textChunk;
          if (!closed) {
            controller.enqueue(sseEvent("text", { text: textChunk }));
          }
        }
        throwIfAborted();

        if (!fullAnswer.trim()) throw new Error("Tutor AI tidak menghasilkan jawaban.");

        const avatarExpression = await getPythonAvatarExpression({
          answer: fullAnswer.trim(),
          question,
          responseMode,
        });
        const ragSources = buildAvatarRagSources(
          capturedChunks,
          avatarExpression,
          responseMode,
          undefined,
          responseMode === "avatar" ? fullAnswer.trim() : undefined,
          adaptive
        );
        const responseTimeMs = Date.now() - startTime;

        await createAiMessage({
          aiChatSessionId: input.sessionId,
          content: fullAnswer.trim(),
          ragSources: ragSources as unknown as Prisma.InputJsonValue,
          responseTimeMs,
        });
        await prisma.aiChatSession.update({
          where: { id: input.sessionId },
          data: { lastActiveAt: new Date() },
        });

        if (!closed) {
          controller.enqueue(sseEvent("metadata", { ragSources, responseTimeMs }));
          controller.enqueue(sseEvent("done", { sessionId: input.sessionId }));
        }
      } catch (err) {
        if (isAbortError(err)) {
          await prisma.aiChatMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
          return;
        }

        const errorMessage = err instanceof Error ? err.message : "Streaming gagal";
        if (!closed) {
          controller.enqueue(sseEvent("error", { error: errorMessage }));
        }
        // Cleanup: delete user message if streaming failed and no AI answer was saved
        if (!fullAnswer.trim()) {
          await prisma.aiChatMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
        }
      } finally {
        input.signal?.removeEventListener("abort", abortHandler);
        closeStream();
      }
    },
  });
}
