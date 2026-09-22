import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ghbu_session";
export const OAUTH_STATE_COOKIE = "ghbu_oauth_state";

const ALGORITHM = "aes-256-gcm";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type SignInMode = "oauth" | "token";

export interface Session {
  /** GitHub access token. Stays server-side at all times. */
  token: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  mode: SignInMode;
  createdAt: number;
}

/** Public view of a session. Safe to return to the browser. */
export interface SessionView {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  mode: SignInMode;
}

export function toSessionView(session: Session): SessionView {
  return {
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl,
    mode: session.mode,
  };
}

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. Set it before signing in.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, payload].map((part) => part.toString("base64url")).join(".");
}

export function unseal(value: string): Session | null {
  const parts = value.split(".");
  const [ivPart, tagPart, payloadPart] = parts;
  if (parts.length !== 3 || !ivPart || !tagPart || !payloadPart) return null;

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const json = Buffer.concat([
      decipher.update(Buffer.from(payloadPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const session = JSON.parse(json) as Session;
    if (typeof session.token !== "string" || typeof session.createdAt !== "number") {
      return null;
    }
    if (Date.now() - session.createdAt > SESSION_MAX_AGE_SECONDS * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

/** Reads and decrypts the current session, or null when absent or expired. */
export function readSession(): Session | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  return raw ? unseal(raw) : null;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const sessionCookieMaxAge = SESSION_MAX_AGE_SECONDS;
