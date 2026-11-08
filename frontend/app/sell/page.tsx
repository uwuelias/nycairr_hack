import { Suspense } from "react";
import { io } from "next/cache";
import { redirect } from "next/navigation";
import SiteFooter from "@/app/components/footer";
import SiteNavbar from "@/app/components/navbar";
import SellForm from "../components/sell-form";
import EvaluationPanel from "../components/evaluation-panel";
import { auth0 } from "@/lib/auth0";

function SellPageLoading() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12" aria-label="Checking sign in">
      <div className="h-10 w-64 animate-pulse rounded-xl bg-surface-soft" />
      <div className="mt-4 h-5 w-96 max-w-full animate-pulse rounded-xl bg-surface-soft" />
      <div className="mt-10 h-96 animate-pulse rounded-3xl bg-surface-soft" />
    </div>
  );
}

async function ProtectedSellPage() {

  await io();
  const session = await auth0?.getSession();

  if (!session) {
    redirect("/auth/login?returnTo=%2Fsell");
  }

  return (
    <>
      <section className="bg-surface-dark px-5 py-14 text-on-dark sm:px-8 sm:py-16 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-medium text-on-dark-soft">Seller space</p>
          <h1 className="mt-3 text-4xl font-normal tracking-tight sm:text-5xl">List something good.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-on-dark-soft">
            Add the details and photos so buyers can get to know your technology.
          </p>
        </div>
      </section>

      <section className="bg-surface-soft px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <EvaluationPanel />
          <SellForm />
        </div>
      </section>
    </>
  );
}

export default function SellPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <SiteNavbar />

      <Suspense fallback={<SellPageLoading />}>
        <ProtectedSellPage />
      </Suspense>

      <SiteFooter />
    </main>
  );
}
