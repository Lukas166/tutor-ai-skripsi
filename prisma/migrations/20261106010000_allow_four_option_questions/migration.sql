BEGIN;

-- Paket lama tetap memiliki A-E; workbook baru memiliki A-D tanpa opsi buatan.
ALTER TABLE question_bank_item DROP CONSTRAINT question_bank_options;
ALTER TABLE question_bank_item ADD CONSTRAINT question_bank_options CHECK (
    jsonb_typeof(options) = 'object'
    AND options ?& ARRAY['A', 'B', 'C', 'D']
    AND options - 'A' - 'B' - 'C' - 'D' - 'E' = '{}'::jsonb
    AND jsonb_typeof(options->'A') = 'string'
    AND jsonb_typeof(options->'B') = 'string'
    AND jsonb_typeof(options->'C') = 'string'
    AND jsonb_typeof(options->'D') = 'string'
    AND (NOT options ? 'E' OR jsonb_typeof(options->'E') = 'string')
    AND options ? "correctOption"
);

COMMIT;
