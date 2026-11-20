ALTER TABLE "student_learning_progress"
ADD COLUMN IF NOT EXISTS "progressSnapshot" JSONB;
