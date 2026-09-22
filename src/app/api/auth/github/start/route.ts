import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { appUrl, isOAuthConfigured, OAUTH_SCOPES } from "@/lib/env";
import { cookieOptions, OAUTH_STATE_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

/** Starts the OAuth dance: stores a state nonce, then redirects to GitHub. */
export function GET(request: Request) {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: "GitHub OAuth is not configured on this deployment." },
      { status: 501 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID as string);
  authorize.searchParams.set(
    "redirect_uri",
    `${appUrl(request)}/api/auth/github/callback`,
  );
  authorize.searchParams.set("scope", OAUTH_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions(600));
  return response;
}
