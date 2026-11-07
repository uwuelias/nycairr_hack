"use client";

import { useUser } from "@auth0/nextjs-auth0/client";

export default function AuthActions() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <span className="h-10 w-24" aria-hidden="true" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden max-w-40 truncate text-charcoal sm:inline">
          {user.email}
        </span>
        <a
          className="rounded-full bg-ink-button px-6 py-3.5 font-bold text-on-ink-button"
          href="/auth/logout"
        >
          Sign out
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <a className="rounded-full px-4 py-3 font-bold" href="/auth/login">
        Sign in
      </a>
      <a
        className="rounded-full bg-ink-button px-6 py-3.5 font-bold text-on-ink-button"
        href="/auth/login?screen_hint=signup"
      >
        Create account
      </a>
    </div>
  );
}
