import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

config({ path: [".env.local", ".env"] });

const root = process.cwd();
const migrationsDirectory = resolve(root, "src/lib/db/migrations");
const configuredUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!configuredUrl && process.env.NODE_ENV === "production") {
  throw new Error("TURSO_DATABASE_URL is required to run migrations in production.");
}

let databaseUrl = configuredUrl;
if (!databaseUrl) {
  const localDatabasePath = resolve(root, ".local", "nutrition-water.db");
  await mkdir(dirname(localDatabasePath), { recursive: true });
  databaseUrl = `file:${localDatabasePath}`;
  console.info("TURSO_DATABASE_URL is empty; applying migrations to the local SQLite database.");
}

const client = createClient({
  url: databaseUrl,
  authToken: authToken || undefined,
});

try {
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.split("_")[0];
    const applied = await client.execute({
      sql: "SELECT version FROM schema_migrations WHERE version = ?",
      args: [version],
    });

    if (applied.rows.length > 0) {
      console.info(`Skipped ${file}; already applied.`);
      continue;
    }

    const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
    await client.executeMultiple(sql);
    await client.execute({
      sql: "INSERT INTO schema_migrations (version) VALUES (?)",
      args: [version],
    });
    console.info(`Applied ${file}.`);
  }
} finally {
  client.close();
}
