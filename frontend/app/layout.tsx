import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JBay",
  description:
    "Discover pre-loved technology worth keeping. Find phones, computers, audio, and more for a second life with the help of our AI agents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
