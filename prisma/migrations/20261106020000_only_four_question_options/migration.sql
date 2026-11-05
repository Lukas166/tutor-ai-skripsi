BEGIN;

-- Data historis tetap terbaca; seluruh INSERT/UPDATE baru wajib memakai A-D.
ALTER TABLE question_bank_item DROP CONSTRAINT question_bank_key;
ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_key
    CHECK ("correctOption" IN ('A', 'B', 'C', 'D')) NOT VALID;

ALTER TABLE question_bank_item DROP CONSTRAINT question_bank_options;
ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_options CHECK (
    jsonb_typeof(options) = 'object'
    AND options ?& ARRAY['A', 'B', 'C', 'D']
    AND options - 'A' - 'B' - 'C' - 'D' = '{}'::jsonb
    AND jsonb_typeof(options->'A') = 'string'
    AND jsonb_typeof(options->'B') = 'string'
    AND jsonb_typeof(options->'C') = 'string'
    AND jsonb_typeof(options->'D') = 'string'
    AND options ? "correctOption"
) NOT VALID;

ALTER TABLE assessment_item DROP CONSTRAINT assessment_item_option;
ALTER TABLE assessment_item ADD CONSTRAINT assessment_item_option
    CHECK ("selectedOption" IN ('A', 'B', 'C', 'D')) NOT VALID;

COMMIT;
