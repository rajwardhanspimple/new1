import { isOAuthConfigured, maxFileBytes } from "@/lib/env";
import { readSession, toSessionView } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tells the client who is signed in and which sign-in methods are available. */
export function GET() {
  const session = readSession();
  return Response.json({
    session: session ? toSessionView(session) : null,
    oauthAvailable: isOAuthConfigured(),
    maxFileBytes: maxFileBytes(),
  });
}
