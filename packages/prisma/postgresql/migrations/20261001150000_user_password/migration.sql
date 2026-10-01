-- Email + password sign-in (FIELDBOT). Additive only.
CREATE TABLE "UserPassword" (
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPassword_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserPassword" ADD CONSTRAINT "UserPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
