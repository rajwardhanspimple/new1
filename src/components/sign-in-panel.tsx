"use client";

import { useState } from "react";
import type { SessionView } from "@/lib/session";

interface SignInPanelProps {
  oauthAvailable: boolean;
  onSignedIn: (session: SessionView) => void;
}

export function SignInPanel({ oauthAvailable, onSignedIn }: SignInPanelProps) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTokenForm, setShowTokenForm] = useState(!oauthAvailable);

  async function submitToken(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json()) as {
        session?: SessionView;
        error?: string;
      };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "That token was rejected.");
      }
      setToken("");
      onSignedIn(payload.session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-100">Connect your GitHub account</h2>
      <p className="mt-1 text-sm text-slate-400">
        The app needs write access to push a commit. Your token is encrypted into a
        server-side session cookie and is never exposed to the page.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {oauthAvailable ? (
          <a className="btn-primary" href="/api/auth/github/start">
            Sign in with GitHub
          </a>
        ) : null}
        {oauthAvailable ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowTokenForm((open) => !open)}
          >
            {showTokenForm ? "Hide token option" : "Use an access token instead"}
          </button>
        ) : null}
      </div>

      {!oauthAvailable ? (
        <p className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          OAuth is not configured on this deployment. Set GITHUB_CLIENT_ID and
          GITHUB_CLIENT_SECRET to enable the sign-in button, or paste a personal access
          token below.
        </p>
      ) : null}

      {showTokenForm ? (
        <form className="mt-4 space-y-3" onSubmit={submitToken}>
          <div>
            <label className="label" htmlFor="token">
              Personal access token
            </label>
            <input
              id="token"
              className="field font-mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_..."
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Needs the <code>repo</code> scope, or fine-grained{" "}
              <code>Contents: Read and write</code> on the target repositories.
            </p>
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !token.trim()}>
            {busy ? "Checking token..." : "Continue"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}
