BEGIN;
-- CreateTable
CREATE TABLE "learning_outcome" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "cpmk" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,

    CONSTRAINT "learning_outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_topic" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseSessionId" TEXT,
    "title" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "cpmkCodes" TEXT[],
    "subCpmkCodes" TEXT[],
    "sourcePdf" TEXT NOT NULL,
    "sourcePages" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,

    CONSTRAINT "domain_topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_topic_outcome" (
    "topicId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,

    CONSTRAINT "domain_topic_outcome_pkey" PRIMARY KEY ("topicId","outcomeId")
);

-- CreateTable
CREATE TABLE "domain_concept" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "domain_concept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_indicator" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cpmkCodes" TEXT[],
    "subCpmkCodes" TEXT[],
    "sourcePdf" TEXT NOT NULL,
    "sourcePages" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,

    CONSTRAINT "domain_indicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_bank_item" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctOption" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "cognitiveLevel" TEXT NOT NULL,
    "practiceNumber" INTEGER,
    "sourcePdf" TEXT NOT NULL,
    "sourcePages" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "sourceData" JSONB NOT NULL,

    CONSTRAINT "question_bank_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PRE',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "correctCount" INTEGER,
    "totalQuestions" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION,

    CONSTRAINT "assessment_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_learning_config" (
    "courseId" TEXT NOT NULL,
    "pretestQuestionCount" INTEGER NOT NULL,
    "datasetName" TEXT NOT NULL,
    "datasetChecksum" TEXT NOT NULL,

    CONSTRAINT "course_learning_config_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "assessment_item" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "questionSnapshot" JSONB NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "assessment_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_indicator_profile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "baselineItemId" TEXT NOT NULL,
    "initialScore" DOUBLE PRECISION NOT NULL,
    "currentScore" DOUBLE PRECISION NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "initialStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_indicator_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_outcome_courseId_code_key" ON "learning_outcome"("courseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "domain_topic_courseId_orderNumber_key" ON "domain_topic"("courseId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "domain_topic_courseId_code_key" ON "domain_topic"("courseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "domain_concept_topicId_name_key" ON "domain_concept"("topicId", "name");

-- CreateIndex
CREATE INDEX "domain_indicator_topicId_idx" ON "domain_indicator"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "domain_indicator_courseId_code_key" ON "domain_indicator"("courseId", "code");

-- CreateIndex
CREATE INDEX "question_bank_item_topicId_kind_idx" ON "question_bank_item"("topicId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_item_courseId_code_key" ON "question_bank_item"("courseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_item_indicatorId_kind_practiceNumber_key" ON "question_bank_item"("indicatorId", "kind", "practiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempt_studentId_courseId_kind_key" ON "assessment_attempt"("studentId", "courseId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_item_attemptId_questionId_key" ON "assessment_item"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_item_attemptId_indicatorId_key" ON "assessment_item"("attemptId", "indicatorId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_item_attemptId_orderNumber_key" ON "assessment_item"("attemptId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "student_indicator_profile_baselineItemId_key" ON "student_indicator_profile"("baselineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "student_indicator_profile_studentId_courseId_indicatorId_key" ON "student_indicator_profile"("studentId", "courseId", "indicatorId");

-- AddForeignKey
ALTER TABLE "learning_outcome" ADD CONSTRAINT "learning_outcome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_topic" ADD CONSTRAINT "domain_topic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_topic" ADD CONSTRAINT "domain_topic_courseSessionId_fkey" FOREIGN KEY ("courseSessionId") REFERENCES "course_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_topic_outcome" ADD CONSTRAINT "domain_topic_outcome_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "domain_topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_topic_outcome" ADD CONSTRAINT "domain_topic_outcome_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "learning_outcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_concept" ADD CONSTRAINT "domain_concept_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "domain_topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_indicator" ADD CONSTRAINT "domain_indicator_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "domain_topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_indicator" ADD CONSTRAINT "domain_indicator_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "domain_concept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_indicator" ADD CONSTRAINT "domain_indicator_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "domain_topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "domain_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_item" ADD CONSTRAINT "question_bank_item_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_learning_config" ADD CONSTRAINT "course_learning_config_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item" ADD CONSTRAINT "assessment_item_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item" ADD CONSTRAINT "assessment_item_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "question_bank_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item" ADD CONSTRAINT "assessment_item_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "domain_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_indicator_profile" ADD CONSTRAINT "student_indicator_profile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_indicator_profile" ADD CONSTRAINT "student_indicator_profile_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_indicator_profile" ADD CONSTRAINT "student_indicator_profile_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "domain_indicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_indicator_profile" ADD CONSTRAINT "student_indicator_profile_baselineItemId_fkey" FOREIGN KEY ("baselineItemId") REFERENCES "assessment_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_kind CHECK (kind IN ('PRE_POST','PRACTICE'));
ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_key CHECK ("correctOption" IN ('A','B','C','D','E'));
ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_options CHECK (
 jsonb_typeof(options)='object' AND options ?& ARRAY['A','B','C','D','E']
 AND options - 'A' - 'B' - 'C' - 'D' - 'E' = '{}'::jsonb
);
CREATE UNIQUE INDEX question_bank_one_prepost_per_indicator ON question_bank_item ("indicatorId") WHERE kind='PRE_POST';
ALTER TABLE course_learning_config ADD CONSTRAINT course_learning_count CHECK ("pretestQuestionCount">0);
ALTER TABLE assessment_attempt ADD CONSTRAINT assessment_attempt_kind CHECK (kind IN ('PRE','POST'));
ALTER TABLE assessment_attempt ADD CONSTRAINT assessment_attempt_status CHECK (status IN ('IN_PROGRESS','SUBMITTED'));
ALTER TABLE assessment_attempt ADD CONSTRAINT assessment_attempt_score CHECK (
 "totalQuestions">0 AND ("correctCount" IS NULL OR "correctCount" BETWEEN 0 AND "totalQuestions")
 AND (percentage IS NULL OR percentage BETWEEN 0 AND 100)
);
ALTER TABLE assessment_item ADD CONSTRAINT assessment_item_option CHECK ("selectedOption" IN ('A','B','C','D','E'));
ALTER TABLE student_indicator_profile ADD CONSTRAINT student_profile_scores CHECK (
 "initialScore" IN (0,1) AND "currentScore" BETWEEN 0 AND 1 AND "evidenceCount">=1
 AND "initialStatus" IN ('NEEDS_REINFORCEMENT','INITIAL_POSITIVE_EVIDENCE')
);
CREATE FUNCTION preserve_student_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."initialScore" IS DISTINCT FROM OLD."initialScore"
 OR NEW."initialStatus" IS DISTINCT FROM OLD."initialStatus"
 OR NEW."baselineItemId" IS DISTINCT FROM OLD."baselineItemId"
 OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
 OR NEW."courseId" IS DISTINCT FROM OLD."courseId"
 OR NEW."indicatorId" IS DISTINCT FROM OLD."indicatorId"
 OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
 RAISE EXCEPTION 'Initial learner baseline is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER student_baseline_immutable BEFORE UPDATE ON student_indicator_profile
FOR EACH ROW EXECUTE FUNCTION preserve_student_baseline();
REVOKE ALL ON learning_outcome,domain_topic,domain_topic_outcome,domain_concept,domain_indicator,
question_bank_item,course_learning_config,assessment_attempt,assessment_item,student_indicator_profile
FROM anon,authenticated,service_role;
COMMIT;
