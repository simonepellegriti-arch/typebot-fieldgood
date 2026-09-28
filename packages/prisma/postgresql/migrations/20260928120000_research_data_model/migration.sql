-- Research data model: immutable published versions, interview completion timestamp,
-- questionnaire version on results, structured answer values and execution index.
-- All new columns are nullable: existing rows are left untouched.

-- AlterTable
ALTER TABLE "PublicTypebot" ADD COLUMN     "currentVersionId" TEXT,
ADD COLUMN     "currentVersionNumber" INTEGER;

-- AlterTable
ALTER TABLE "Result" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "publishedVersionId" TEXT,
ADD COLUMN     "publishedVersionNumber" INTEGER;

-- AlterTable
ALTER TABLE "AnswerV2" ADD COLUMN     "executionIndex" INTEGER,
ADD COLUMN     "value" JSONB,
ADD COLUMN     "valueLabel" JSONB;

-- CreateTable
CREATE TABLE "PublicTypebotVersion" (
    "id" TEXT NOT NULL,
    "typebotId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "schemaVersion" TEXT,
    "groups" JSONB NOT NULL,
    "events" JSONB,
    "variables" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "theme" JSONB NOT NULL,
    "settings" JSONB NOT NULL,

    CONSTRAINT "PublicTypebotVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicTypebotVersion_typebotId_versionNumber_key" ON "PublicTypebotVersion"("typebotId", "versionNumber");

-- CreateIndex
CREATE INDEX "Result_typebotId_publishedVersionNumber_idx" ON "Result"("typebotId", "publishedVersionNumber");

-- CreateIndex
CREATE INDEX "AnswerV2_resultId_blockId_idx" ON "AnswerV2"("resultId", "blockId");

-- AddForeignKey
ALTER TABLE "PublicTypebotVersion" ADD CONSTRAINT "PublicTypebotVersion_typebotId_fkey" FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every currently published typebot gets an immutable version 1 snapshot,
-- so that interviews started after this migration are versioned right away.
-- Results created before this migration keep a NULL version ("pre-versioning").
INSERT INTO "PublicTypebotVersion" ("id", "typebotId", "versionNumber", "publishedAt", "schemaVersion", "groups", "events", "variables", "edges", "theme", "settings")
SELECT
    'v1_' || md5(pt."id" || clock_timestamp()::text),
    pt."typebotId",
    1,
    pt."updatedAt",
    pt."version",
    pt."groups",
    pt."events",
    pt."variables",
    pt."edges",
    pt."theme",
    pt."settings"
FROM "PublicTypebot" pt;

UPDATE "PublicTypebot" pt
SET "currentVersionId" = v."id",
    "currentVersionNumber" = v."versionNumber"
FROM "PublicTypebotVersion" v
WHERE v."typebotId" = pt."typebotId" AND v."versionNumber" = 1;
