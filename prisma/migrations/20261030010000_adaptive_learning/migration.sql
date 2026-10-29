BEGIN;

-- AlterTable
ALTER TABLE "course_learning_config" ADD COLUMN     "developingThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "emaAlpha" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
ADD COLUMN     "minimumStudySeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "readyThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

-- CreateTable
CREATE TABLE "practice_session" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chatSessionId" TEXT,
    "indicatorId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OFFERED',
    "questionSnapshot" JSONB NOT NULL,
    "hintCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "firstAnsweredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_event" (
    "id" TEXT NOT NULL,
    "practiceSessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "hintCount" INTEGER NOT NULL,
    "scoreBefore" DOUBLE PRECISION,
    "scoreAfter" DOUBLE PRECISION,
    "emaAlpha" DOUBLE PRECISION,
    "feedback" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_learning_progress" (
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStudiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_learning_progress_pkey" PRIMARY KEY ("studentId","courseId")
);

-- CreateIndex
CREATE INDEX "practice_session_chatSessionId_idx" ON "practice_session"("chatSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_session_studentId_courseId_questionId_key" ON "practice_session"("studentId", "courseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_event_practiceSessionId_requestId_key" ON "practice_event"("practiceSessionId", "requestId");

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ai_chat_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "domain_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question_bank_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_event" ADD CONSTRAINT "practice_event_practiceSessionId_fkey" FOREIGN KEY ("practiceSessionId") REFERENCES "practice_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_learning_progress" ADD CONSTRAINT "student_learning_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_learning_progress" ADD CONSTRAINT "student_learning_progress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE course_learning_config ADD CONSTRAINT learning_parameters_valid CHECK (
 "emaAlpha">0 AND "emaAlpha"<=1 AND "developingThreshold">=0
 AND "developingThreshold"<"readyThreshold" AND "readyThreshold"<=1
 AND "minimumStudySeconds">=0
);
ALTER TABLE practice_session ADD CONSTRAINT practice_state_valid CHECK (
 status IN ('OFFERED','ACTIVE','DISMISSED','COMPLETED') AND "hintCount" BETWEEN 0 AND 3
 AND "answerCount">=0
);
ALTER TABLE practice_event ADD CONSTRAINT practice_event_valid CHECK (
 kind IN ('ANSWER','HINT') AND "selectedOption" IN ('A','B','C','D','E')
 AND (NOT independent OR (kind='ANSWER' AND "hintCount"=0 AND "scoreAfter" IS NOT NULL))
 AND ("scoreBefore" IS NULL OR "scoreBefore" BETWEEN 0 AND 1)
 AND ("scoreAfter" IS NULL OR "scoreAfter" BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX practice_one_independent_evidence ON practice_event ("practiceSessionId")
WHERE independent=true;
REVOKE ALL ON practice_session,practice_event,student_learning_progress
FROM anon,authenticated,service_role;
COMMIT;
