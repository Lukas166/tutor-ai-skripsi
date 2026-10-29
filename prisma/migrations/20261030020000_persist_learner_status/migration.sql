BEGIN;
ALTER TABLE student_indicator_profile ADD COLUMN "currentStatus" TEXT NOT NULL DEFAULT 'NOT_ASSESSED';
UPDATE student_indicator_profile p SET "currentStatus" = CASE
 WHEN p."evidenceCount"=1 THEN p."initialStatus"
 WHEN p."currentScore">=c."readyThreshold" THEN 'READY_TO_ADVANCE'
 WHEN p."currentScore">=c."developingThreshold" THEN 'DEVELOPING'
 ELSE 'NEEDS_REINFORCEMENT' END
FROM course_learning_config c WHERE c."courseId"=p."courseId";
ALTER TABLE student_indicator_profile ADD CONSTRAINT student_current_status_valid CHECK (
 "currentStatus" IN ('NOT_ASSESSED','NEEDS_REINFORCEMENT','INITIAL_POSITIVE_EVIDENCE',
                     'DEVELOPING','READY_TO_ADVANCE')
);
COMMIT;
