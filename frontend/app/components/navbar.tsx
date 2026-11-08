import Link from "next/link";
import AuthActions from "./auth-actions";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-20 bg-surface-dark text-on-dark">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight text-primary" href="/" aria-label="JBay home">
          <img src="/jbay-mark.svg" alt="" width="32" height="32" />
          <span>JBay</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm sm:flex" aria-label="Main navigation">
          <Link className="text-body-muted" href="/marketplace">Marketplace</Link>
          <Link className="text-body-muted" href="/negotiate">Chats</Link>
          <Link className="text-body-muted" href="/sell">Sell with us</Link>
        </nav>
        <AuthActions />
      </div>
    </header>
  );
}
