-- "Other, please specify": open answers stored next to the option codes, never merged into labels.
ALTER TABLE "AnswerV2" ADD COLUMN "otherTexts" JSONB;
