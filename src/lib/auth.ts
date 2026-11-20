import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/libsql";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/auth-schema";

const drizzleDb = drizzle(db, { schema });
const secret = process.env.BETTER_AUTH_SECRET;
const vercelPreviewURL = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;
const baseURL = vercelPreviewURL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
const trustedOrigins = [baseURL];

// Next.js can pick another port when 3000 is occupied. Allow loopback origins
// on any port only for local development; production stays pinned to BETTER_AUTH_URL.
if (process.env.NODE_ENV !== "production") {
  trustedOrigins.push("http://localhost:*", "http://127.0.0.1:*", "http://[::1]:*");
}

if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("Set BETTER_AUTH_SECRET to a random value of at least 32 characters.");
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
