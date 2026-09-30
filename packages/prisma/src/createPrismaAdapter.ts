import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPlanetScale } from "@prisma/adapter-planetscale";

const getSchemaFromUrl = (url: string): string | undefined => {
  try {
    return new URL(url).searchParams.get("schema") ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * Serverless instances (Vercel) are frozen with their idle connections still open:
 * with a session-mode pooler (e.g. Supabase Supavisor, 15 connections) a few
 * instances holding pg's default pool of 10 exhaust it and every query fails.
 * Keep the per-instance pool small and release idle connections quickly.
 * `connection_limit` in the URL (Prisma convention) overrides the default.
 */
const getPoolOptions = (url: string) => {
  const connectionLimit = Number(
    (() => {
      try {
        return new URL(url).searchParams.get("connection_limit");
      } catch {
        return null;
      }
    })(),
  );
  const isServerless = Boolean(process.env.VERCEL);
  const max =
    Number.isInteger(connectionLimit) && connectionLimit > 0
      ? connectionLimit
      : isServerless
        ? 2
        : undefined;
  return {
    ...(max !== undefined ? { max } : {}),
    ...(isServerless ? { idleTimeoutMillis: 5_000 } : {}),
  };
};

export const createPrismaAdapter = (databaseUrl: string | undefined) => {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  if (
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://")
  )
    // The `?schema=` search param is applied by Prisma Migrate but the driver
    // adapter does not read it from the connection string, so pass it through
    // explicitly. Without this, runtime queries default to the `public` schema
    // even when the tables live in a custom schema.
    return new PrismaPg(
      { connectionString: databaseUrl, ...getPoolOptions(databaseUrl) },
      { schema: getSchemaFromUrl(databaseUrl) },
    );

  if (databaseUrl.startsWith("mysql://"))
    return new PrismaPlanetScale({ url: databaseUrl });

  throw new Error(
    "Invalid `DATABASE_URL` format, it should start with `postgresql://`, `postgres://` or `mysql://`",
  );
};
