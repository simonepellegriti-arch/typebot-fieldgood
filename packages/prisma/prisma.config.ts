import { defineConfig } from "prisma/config";

export default defineConfig({
  datasource: {
    // Prisma CLI (migrate, db push) needs a session connection: transaction poolers
    // (e.g. Supabase port 6543, used at runtime) can't hold migration advisory locks.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
