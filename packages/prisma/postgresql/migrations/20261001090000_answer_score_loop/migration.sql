-- Scores (separate from answer codes), research details and loop context of answers. Additive only.
ALTER TABLE "AnswerV2" ADD COLUMN "score" DOUBLE PRECISION;
ALTER TABLE "AnswerV2" ADD COLUMN "details" JSONB;
ALTER TABLE "AnswerV2" ADD COLUMN "loopBlockId" TEXT;
ALTER TABLE "AnswerV2" ADD COLUMN "loopIteration" INTEGER;
ALTER TABLE "AnswerV2" ADD COLUMN "loopItem" TEXT;
