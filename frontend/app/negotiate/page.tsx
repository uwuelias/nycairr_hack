"use client";

import dynamic from "next/dynamic";

// Client-only: the page reads localStorage and the invite link from the URL on first render.
const Negotiate = dynamic(() => import("./negotiate-client"), { ssr: false });

export default function NegotiatePage() {
  return <Negotiate />;
}
