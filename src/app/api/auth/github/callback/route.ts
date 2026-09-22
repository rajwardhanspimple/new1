import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl, isOAuthConfigured } from "@/lib/env";
import { fetchViewer } from "@/lib/github";
import {
  cookieOptions,
  OAUTH_STATE_COOKIE,
  seal,
  SESSION_COOKIE,
  sessionCookieMaxAge,
} from "@/lib/session";

export const runtime = "nodejs";

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function failure(request: Request, reason: string) {
  const target = new URL("/", appUrl(request));
  target.searchParams.set("error", reason);
  return NextResponse.redirect(target.toString());
}

/** Completes OAuth: verifies state, swaps the code, and seals the session. */
export async function GET(request: Request) {
  if (!isOAuthConfigured()) {
    return failure(request, "GitHub OAuth is not configured on this deployment.");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookies().get(OAUTH_STATE_COOKIE)?.value;

  if (url.searchParams.get("error")) {
    return failure(
      request,
      url.searchParams.get("error_description") ?? "GitHub declined the sign-in request.",
    );
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return failure(request, "Sign-in could not be verified. Please try again.");
  }

  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "github-bulk-uploader",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${appUrl(request)}/api/auth/github/callback`,
    }),
    cache: "no-store",
  });

  const payload = (await exchange.json()) as TokenResponse;
  if (!exchange.ok || !payload.access_token) {
    return failure(
      request,
      payload.error_description ?? payload.error ?? "Could not obtain a GitHub token.",
    );
  }

  try {
    const viewer = await fetchViewer(payload.access_token);
    const response = NextResponse.redirect(new URL("/", appUrl(request)).toString());
    response.cookies.set(
      SESSION_COOKIE,
      seal({
        token: payload.access_token,
        login: viewer.login,
        name: viewer.name,
        avatarUrl: viewer.avatar_url,
        mode: "oauth",
        createdAt: Date.now(),
      }),
      cookieOptions(sessionCookieMaxAge),
    );
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    return failure(
      request,
      error instanceof Error ? error.message : "Could not read your GitHub account.",
    );
  }
}
