import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bulk Uploader for GitHub",
  description:
    "Sign in with GitHub, choose any repository you can write to, and upload many files in one commit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <div className="mx-auto w-full max-w-5xl px-6 py-10">{children}</div>
      </body>
    </html>
  );
}
