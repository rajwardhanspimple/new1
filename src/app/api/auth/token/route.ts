import { NextResponse } from "next/server";
import { jsonError, toErrorResponse } from "@/lib/api";
import { fetchViewer } from "@/lib/github";
import {
  cookieOptions,
  seal,
  SESSION_COOKIE,
  sessionCookieMaxAge,
  toSessionView,
  type Session,
} from "@/lib/session";

export const runtime = "nodejs";

/** Signs in with a pasted personal access token, validated against /user. */
export async function POST(request: Request) {
  let token: string;
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return jsonError("Send a JSON body containing a token.", 400);
  }

  if (!token) {
    return jsonError("Paste a GitHub personal access token.", 400);
  }

  try {
    const viewer = await fetchViewer(token);
    const session: Session = {
      token,
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatar_url,
      mode: "token",
      createdAt: Date.now(),
    };
    const response = NextResponse.json({ session: toSessionView(session) });
    response.cookies.set(SESSION_COOKIE, seal(session), cookieOptions(sessionCookieMaxAge));
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
