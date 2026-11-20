import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/libsql";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/auth-schema";

const drizzleDb = drizzle(db, { schema });
const secret = process.env.BETTER_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
function cleanEnvironmentValue(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const isWrappedInQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return isWrappedInQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

function normalizeWebOrigin(value: string | undefined, assumeHttps = false) {
  const cleaned = cleanEnvironmentValue(value);
  if (!cleaned) return null;

  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(cleaned);
    const parsed = new URL(hasScheme || !assumeHttps ? cleaned : `https://${cleaned}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const vercelPreviewURL = process.env.VERCEL_ENV === "preview"
  ? normalizeWebOrigin(process.env.VERCEL_URL, true)
  : null;
const configuredBaseURL = normalizeWebOrigin(process.env.BETTER_AUTH_URL);
const vercelDeploymentURL = normalizeWebOrigin(process.env.VERCEL_URL, true);
const baseURL = vercelPreviewURL || configuredBaseURL || vercelDeploymentURL || "http://localhost:3000";
const vercelOrigins = [
  normalizeWebOrigin("https://water-r66w.vercel.app"),
  normalizeWebOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL, true),
  normalizeWebOrigin(process.env.VERCEL_URL, true),
  normalizeWebOrigin(process.env.VERCEL_BRANCH_URL, true),
].filter((origin): origin is string => origin !== null);
const trustedOrigins = [...new Set([baseURL, ...vercelOrigins])];

// Next.js can pick another port when 3000 is occupied. Allow loopback origins
// on any port only for local development; production stays pinned to BETTER_AUTH_URL.
if (process.env.NODE_ENV !== "production") {
  trustedOrigins.push("http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*");
}

if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("Set BETTER_AUTH_SECRET (or AUTH_SECRET) to a random value of at least 32 characters.");
}

export const auth = betterAuth({
  appName: "Ритм дня",
  secret: secret || "local-development-secret-change-before-deploy-2026",
  baseURL,
  trustedOrigins,
  database: drizzleAdapter(drizzleDb, { provider: "sqlite", schema, camelCase: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    cookiePrefix: "nutrition-water",
  },
});
