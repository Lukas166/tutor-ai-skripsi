-- The workbook remains the editable source; these copies were never read by LMS or assessment.
BEGIN;
ALTER TABLE learning_outcome DROP COLUMN "sourceData";
ALTER TABLE domain_topic DROP COLUMN "sourceData";
ALTER TABLE domain_indicator DROP COLUMN "sourceStatus", DROP COLUMN "sourceData";
ALTER TABLE question_bank_item DROP COLUMN "validationStatus", DROP COLUMN "sourceData";
COMMIT;
