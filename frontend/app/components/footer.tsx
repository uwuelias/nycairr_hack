import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-hairline bg-canvas px-5 py-8 text-sm text-body sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link className="font-semibold text-primary" href="/">JBay</Link>
          <p className="mt-1">Good technology deserves another life.</p>
        </div>
        <nav className="flex gap-6" aria-label="Footer navigation">
          <Link className="text-body-muted hover:text-primary" href="/marketplace">Marketplace</Link>
          <Link className="text-body-muted hover:text-primary" href="/sell">Sell with us</Link>
        </nav>
      </div>
    </footer>
  );
}
