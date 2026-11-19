import "server-only";

import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const globalForDb = globalThis as typeof globalThis & {
  nutritionDb?: Client;
};

function createDatabaseClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    return createClient({
      url,
      authToken: authToken || undefined,
    });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("TURSO_DATABASE_URL must be configured in production.");
  }

  const localDatabasePath = resolve(process.cwd(), ".local", "nutrition-water.db");
  mkdirSync(dirname(localDatabasePath), { recursive: true });
  return createClient({ url: `file:${localDatabasePath}` });
}

export const db = globalForDb.nutritionDb ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.nutritionDb = db;
}
