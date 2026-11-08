"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const API = "/api/negotiation"; // keep it exposed; no point in keeping it in an .env
const SAVED_KEY = "forme.negotiations";

type Role = "buyer" | "seller";
type Saved = { id: string; role: Role; token: string; title: string };
type Message = { sender: string; text: string; price?: number; ts: number };
type InboxPreview = { status: string; text: string; ts?: number };
type Session = {
  session_id: string; role: Role; status: string;
  item: { brand: string; model: string; condition: string; listing_title?: string };
  price_report: { p50: number | null; n_sold: number; confidence: string };
  you_submitted_bound: boolean; other_submitted_bound: boolean;
  you_agent_enabled: boolean; other_agent_enabled: boolean;
  bound_feedback?: string;
  proposed_price: number | null; agreed_price: number | null;
  you_responded: boolean | null; messages: Message[];
};

function loadSaved(): Saved[] {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]"); } catch { return []; }
}
function storeSaved(list: Saved[]) {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch {}
}

async function api(path: string, token?: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { "X-Session-Token": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  return data;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Sessions saved in this browser, plus one from an invite link (?s=&t=&r=) if present. */
function initialState(): { saved: Saved[]; active: Saved | null } {
  let saved = loadSaved();
  const p = new URLSearchParams(window.location.search);
  const id = p.get("s"), token = p.get("t"), role = p.get("r") as Role | null;
  if (!id || !token || !role) return { saved, active: null };
  const entry = { id, token, role, title: "Shared negotiation" };
  saved = [entry, ...saved.filter((s) => s.id !== id || s.role !== role)];
  storeSaved(saved);
  return { saved, active: entry };
}

export default function NegotiateClient() {
  const [init] = useState(initialState);
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listingId");
  const [saved, setSaved] = useState<Saved[]>(init.saved);
  const [inboxPreviews, setInboxPreviews] = useState<Record<string, InboxPreview>>({});
  const [sellerInboxNotice, setSellerInboxNotice] = useState<string | null>(null);
  const [active, setActive] = useState<Saved | null>(init.active);
  const [session, setSession] = useState<Session | null>(null);
  const [startingListing, setStartingListing] = useState(Boolean(listingId));
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listingStartRef = useRef<string | null>(null);

  // Drop the token from the address bar once it has been saved.
  useEffect(() => { if (init.active) window.history.replaceState(null, "", "/negotiate"); }, [init]);

  useEffect(() => {
    if (!listingId) {
      listingStartRef.current = null;
      return;
    }
    if (init.active || listingStartRef.current === listingId) return;
    listingStartRef.current = listingId;
    setStartingListing(true);
    setError(null);
    setSession(null);
    setActive(null);
    setInvite(null);
    async function startListingNegotiation() {
      try {
        const response = await fetch("/api/negotiation/listing-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        const created = await response.json();
        if (!response.ok) throw new Error(created.error ?? "The chat could not be started.");
        const mine: Saved = {
          id: created.session_id,
          role: "buyer",
          token: created.buyer_token,
          title: created.title,
        };
        setSaved((current) => {
          const nextSaved = [mine, ...current.filter((entry) => entry.id !== mine.id || entry.role !== mine.role)];
          storeSaved(nextSaved);
          return nextSaved;
        });
        setActive(mine);
        setInvite(created.seller_invite_token
          ? `${window.location.origin}/negotiate?s=${created.session_id}&t=${created.seller_invite_token}&r=seller`
          : null);
        window.history.replaceState(null, "", "/negotiate");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setStartingListing(false);
      }
    }
    void startListingNegotiation();
  }, [init.active, listingId]);

  useEffect(() => {
    let stopped = false;
    async function refreshSellerInbox() {
      try {
        const response = await fetch("/api/negotiation/inbox", { cache: "no-store" });
        if (!response.ok) {
          if (!stopped) {
            setSellerInboxNotice(response.status === 401
              ? "Sign in to receive chats for your listings."
              : "Seller chats could not be loaded. Try refreshing the page.");
          }
          return;
        }
        const data = await response.json() as { chats: Saved[] };
        if (!stopped) setSellerInboxNotice(null);
        if (stopped || !data.chats.length) return;
        setSaved((current) => {
          const existing = new Set(current.map((entry) => `${entry.id}-${entry.role}`));
          const next = [...current, ...data.chats.filter((entry) => !existing.has(`${entry.id}-${entry.role}`))];
          if (next.length === current.length) return current;
          storeSaved(next);
          return next;
        });
      } catch {
        if (!stopped) setSellerInboxNotice("Seller chats could not be loaded. Try refreshing the page.");
      }
    }
    void refreshSellerInbox();
    const interval = setInterval(() => void refreshSellerInbox(), 5_000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!saved.length) {
      setInboxPreviews({});
      return;
    }
    let stopped = false;
    async function refreshInbox() {
      const results = await Promise.all(saved.map(async (entry) => {
        try {
          const nextSession = await api(`/sessions/${entry.id}`, entry.token) as Session;
          const latest = nextSession.messages.at(-1);
          const title = nextSession.item.listing_title || `${nextSession.item.brand} ${nextSession.item.model}`;
          return {
            key: `${entry.id}-${entry.role}`,
            entry,
            title,
            preview: {
              status: nextSession.status,
              text: latest?.text ?? "No messages yet",
              ts: latest?.ts,
            } satisfies InboxPreview,
          };
        } catch {
          return {
            key: `${entry.id}-${entry.role}`,
            entry,
            title: entry.title,
            preview: { status: "unavailable", text: "Open chat to reconnect" } satisfies InboxPreview,
          };
        }
      }));
      if (stopped) return;
      setInboxPreviews(Object.fromEntries(results.map(({ key, preview }) => [key, preview])));
      setSaved((current) => {
        let changed = false;
        const next = current.map((entry) => {
          const result = results.find((item) => item.key === `${entry.id}-${entry.role}`);
          if (result && result.title !== entry.title) {
            changed = true;
            return { ...entry, title: result.title };
          }
          return entry;
        });
        if (!changed) return current;
        storeSaved(next);
        return next;
      });
    }
    const first = setTimeout(() => void refreshInbox(), 0);
    const interval = setInterval(() => void refreshInbox(), 10_000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [saved]);

  function open(s: Saved, inviteLink: string | null = null) {
    setActive(s); setSession(null); setInvite(inviteLink); setError(null);
  }

  // Fetch the active session from the backend DB, and poll so the other side's actions show up.
  const refresh = useCallback(async () => {
    if (!active) return;
    try { setSession(await api(`/sessions/${active.id}`, active.token)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 2000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [active, refresh]);

  async function act(path: string, body: unknown, method = "POST"): Promise<Session | null> {
    if (!active) return null;
    try {
      const nextSession = await api(`/sessions/${active.id}${path}`, active.token, body, method) as Session;
      setSession(nextSession);
      setError(null);
      return nextSession;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 text-ink-deep sm:px-8 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:h-[calc(100dvh-7rem)]">
        <Link href="/" className="text-sm font-bold">← JBay</Link>
        <div className="flex min-h-0 flex-1 flex-col text-sm">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Inbox</h1>
            <span className="rounded-full bg-surface-soft px-2.5 py-1 text-xs text-steel">{saved.length}</span>
          </div>
          {sellerInboxNotice && <p className="mb-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-950">{sellerInboxNotice}{sellerInboxNotice.startsWith("Sign in") && <> <a className="font-semibold underline" href="/auth/login?returnTo=%2Fnegotiate">Sign in</a></>}</p>}
          {saved.length === 0 && <p className="rounded-2xl bg-surface-soft p-3 text-steel">Your seller chats will appear here. Open a listing and choose “Chat with seller” to start one.</p>}
          <div className="flex flex-col gap-2 overflow-y-auto lg:min-h-0 lg:flex-1">
            {saved.map((entry) => {
              const key = `${entry.id}-${entry.role}`;
              const preview = inboxPreviews[key];
              const selected = active?.id === entry.id && active.role === entry.role;
              return (
                <button key={key} onClick={() => open(entry)}
                  aria-current={selected ? "true" : undefined}
                  className={`w-full rounded-2xl px-3 py-3 text-left transition-colors ${selected ? "bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300" : "bg-surface-soft hover:bg-surface-strong"}`}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 font-semibold">{entry.title}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${selected ? "bg-white/75 text-emerald-950" : "bg-canvas text-steel"}`}>{preview?.status?.replaceAll("_", " ") ?? entry.role}</span>
                  </span>
                  <span className={`mt-1 block line-clamp-2 text-[11px] capitalize ${selected ? "text-emerald-900/75" : "text-steel"}`}>{entry.role} · {preview?.text ?? "Loading chat…"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-4xl border border-hairline-soft">
        {error && <p className="m-4 rounded-2xl bg-orange-100 p-3 text-sm">{error}</p>}
        {!active && !startingListing && <div className="m-auto px-6 text-center"><p className="font-semibold">Select a chat to open it.</p>{saved.length === 0 && <Link href="/marketplace" className="mt-2 inline-block text-sm font-semibold text-primary">Browse listings</Link>}</div>}
        {startingListing && <p className="m-auto text-steel">Starting chat for this listing…</p>}
        {active && !session && !error && <p className="m-auto text-steel">Loading…</p>}
        {session && <ChatWindow key={`${session.session_id}-${session.role}`} session={session} invite={invite} act={act} />}
      </section>
    </main>
  );
}

function ChatWindow({ session, invite, act }: {
  session: Session; invite: string | null; act: (path: string, body: unknown, method?: string) => Promise<Session | null>;
}) {
  const [text, setText] = useState("");
  const [limit, setLimit] = useState("");
  const [useAgent, setUseAgent] = useState(false);
  const [boundFeedback, setBoundFeedback] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const me = session.role;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [session.messages.length]);

  function who(sender: string) {
    if (sender === "system") return "Broker";
    const side = sender.replace("_agent", "");
    const label = side === me ? "You" : side[0].toUpperCase() + side.slice(1);
    return sender.endsWith("_agent") ? `${label === "You" ? "Your" : `${label}'s`} agent` : label;
  }

  return (
    <>
      <header className="border-b border-hairline-soft p-5">
        <p className="text-xs font-bold tracking-widest text-steel">{session.role.toUpperCase()} · {session.status.replaceAll("_", " ").toUpperCase()}</p>
        <h1 className="mt-1 text-xl font-semibold">{session.item.listing_title || `${session.item.brand} ${session.item.model}`} <span className="text-steel">({session.item.condition.replaceAll("_", " ")})</span></h1>
        {session.price_report.p50 !== null && <p className="text-sm text-steel">Market average {money(session.price_report.p50)} from {session.price_report.n_sold} sales</p>}
        {invite && (
          <div className="mt-2 rounded-2xl bg-emerald-100 p-3 text-xs">
            <p>Share this link with the seller so they can join the chat:</p>
            <p className="mt-1 break-all font-semibold">{invite}</p>
            <button type="button" className="mt-2 rounded-full bg-canvas px-3 py-1.5 font-semibold text-ink" onClick={() => {
              void navigator.clipboard.writeText(invite).then(() => setInviteCopied(true)).catch(() => setInviteCopied(false));
            }}>{inviteCopied ? "Copied" : "Copy seller link"}</button>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5">
        {session.messages.map((m, i) => {
          const mine = m.sender === me || m.sender === `${me}_agent`;
          const system = m.sender === "system";
          const buyerMessage = m.sender === "buyer" || m.sender === "buyer_agent";
          return (
            <div key={i} className={`max-w-[80%] ${system ? "self-center text-center" : mine ? "self-end" : "self-start"}`}>
              <p className="mb-0.5 text-[10px] font-bold tracking-wider text-steel">{who(m.sender)}</p>
              <p className={`rounded-2xl px-4 py-2 text-sm ${system ? "bg-surface-soft text-charcoal" : buyerMessage ? "bg-blue-100 text-blue-950" : "bg-violet-100 text-violet-950"}`}>{m.text}</p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <footer className="flex flex-col gap-3 border-t border-hairline-soft p-4">
        {!session.you_submitted_bound && session.status === "collecting_bounds" && (
          <form className="flex flex-col gap-2" onSubmit={(e) => {
            e.preventDefault();
            void act("/bound", { amount: Number(limit), use_agent: useAgent }, "PUT").then((result) => {
              setBoundFeedback(result?.bound_feedback ?? null);
            });
          }}>
            <div className="flex gap-2">
              <input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" min="1" step="0.01" required
                placeholder={me === "buyer" ? "Most you'll pay (private)" : "Least you'll accept (private)"}
                className="flex-1 rounded-full bg-surface-soft px-4 py-2 text-sm" />
              <button className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary">Set limit</button>
            </div>
            <label className="flex items-center gap-2 px-2 text-xs text-steel">
              <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
              Let my agent negotiate with the other side&apos;s agent
            </label>
          </form>
        )}
        {session.you_submitted_bound && session.status === "collecting_bounds" && (
          <p className="text-sm text-steel">Your private limit is in. Waiting for the other side…</p>
        )}
        {boundFeedback && <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-950" role="status">{boundFeedback}</p>}
        {session.status === "chatting" && session.you_submitted_bound && (
          <div className="rounded-2xl bg-surface-soft p-3 text-sm">
            {session.you_agent_enabled
              ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-steel">Your agent is opted in. {session.other_agent_enabled ? "Both agents are ready." : "It will start when the other side opts in. You can still chat directly."}</p>{!session.other_agent_enabled && <button type="button" onClick={() => void act("/agent", { enabled: false }, "PUT")} className="text-xs font-semibold text-primary">Turn off agent</button>}</div>
              : <button type="button" onClick={() => void act("/agent", { enabled: true }, "PUT")} className="rounded-full bg-primary px-4 py-2 font-semibold text-on-primary">Let my agent negotiate</button>}
          </div>
        )}
        {session.status === "awaiting_approval" && session.you_responded === null && session.proposed_price !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className="flex-1">Agents propose <strong>{money(session.proposed_price)}</strong></span>
            <button onClick={() => act("/respond", { approve: true })} className="rounded-full bg-ink-button px-5 py-2 font-bold text-on-ink-button">Accept</button>
            <button onClick={() => act("/respond", { approve: false })} className="rounded-full border-2 border-ink-deep px-5 py-2 font-bold">Decline</button>
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { act("/messages", { text }); setText(""); } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the other side"
            className="flex-1 rounded-full bg-surface-soft px-4 py-2 text-sm" />
          <button className="rounded-full border-2 border-ink-deep px-5 py-2 text-sm font-bold">Send</button>
        </form>
      </footer>
    </>
  );
}
