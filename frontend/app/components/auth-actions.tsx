"use client";

import { useUser } from "@auth0/nextjs-auth0/client";

export default function AuthActions() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <span className="h-10 w-24" aria-hidden="true" />;
  }

  if (user) {
    return <div className="flex items-center gap-3 text-xs">
      <span className="hidden max-w-40 truncate text-body-muted sm:inline">{user.email}</span>
      <a className="rounded-full bg-primary px-4 py-2 text-on-primary" href="/auth/logout">Sign out</a>
    </div>;
  }

  return <div className="flex items-center gap-3 text-xs">
    <a className="text-body-muted" href="/auth/login">Sign in</a>
    <a className="rounded-full bg-primary px-4 py-2 text-on-primary" href="/auth/login?screen_hint=signup">Sign up</a>
  </div>;
}
