-- Respondent lists with unique links, resume and Airtable dashboard (FIELDBOT). Additive only.
CREATE TABLE "ParticipantPanel" (
    "typebotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idColumn" TEXT,
    "columns" JSONB NOT NULL,
    "airtable" JSONB,
    "airtableTokenData" TEXT,
    "airtableTokenIv" TEXT,

    CONSTRAINT "ParticipantPanel_pkey" PRIMARY KEY ("typebotId")
);

CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typebotId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "externalId" TEXT,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "checkpoint" TEXT,
    "resultId" TEXT,
    "airtableRecordId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Participant_token_key" ON "Participant"("token");
CREATE UNIQUE INDEX "Participant_resultId_key" ON "Participant"("resultId");
CREATE INDEX "Participant_typebotId_createdAt_idx" ON "Participant"("typebotId", "createdAt");

ALTER TABLE "ParticipantPanel" ADD CONSTRAINT "ParticipantPanel_typebotId_fkey" FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_typebotId_fkey" FOREIGN KEY ("typebotId") REFERENCES "Typebot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
