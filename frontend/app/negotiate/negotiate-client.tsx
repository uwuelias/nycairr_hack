"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const API = "/api/negotiation"; // keep it exposed; no point in keeping it in an .env
const SAVED_KEY = "forme.negotiations";

type Role = "buyer" | "seller";
type Saved = { id: string; role: Role; token: string; title: string };
type Message = { sender: string; text: string; price?: number; ts: number };
type Session = {
  session_id: string; role: Role; status: string;
  item: { brand: string; model: string; condition: string };
  price_report: { p50: number | null; n_sold: number; confidence: string };
  you_submitted_bound: boolean; other_submitted_bound: boolean;
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
  const [saved, setSaved] = useState<Saved[]>(init.saved);
  const [active, setActive] = useState<Saved | null>(init.active);
  const [session, setSession] = useState<Session | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drop the token from the address bar once it has been saved.
  useEffect(() => { if (init.active) window.history.replaceState(null, "", "/negotiate"); }, [init]);

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

  async function act(path: string, body: unknown, method = "POST") {
    if (!active) return;
    try { setSession(await api(`/sessions/${active.id}${path}`, active.token, body, method)); setError(null); }
    catch (e) { setError((e as Error).message); }
  }

  async function create(form: FormData) {
    const item = {
      category: String(form.get("category")), brand: String(form.get("brand")),
      model: String(form.get("model")), condition: String(form.get("condition")),
    };
    const role = form.get("role") as Role;
    try {
      const r = await api("/sessions", undefined, { query: item });
      const title = `${item.brand} ${item.model}`;
      const other: Role = role === "buyer" ? "seller" : "buyer";
      const mine: Saved = { id: r.session_id, role, token: r[`${role}_token`], title };
      const list = [mine, ...saved];
      storeSaved(list); setSaved(list);
      open(mine, `${window.location.origin}/negotiate?s=${r.session_id}&t=${r[`${other}_token`]}&r=${other}`);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 text-ink-deep sm:px-8 lg:grid-cols-[280px_1fr]">
      <aside className="flex flex-col gap-4">
        <Link href="/" className="text-sm font-bold">← JBay</Link>
        <form action={create} className="flex flex-col gap-2 rounded-3xl bg-surface-soft p-4 text-sm">
          <p className="font-bold">New negotiation</p>
          <input name="category" defaultValue="phones" className="rounded-full bg-canvas px-4 py-2" aria-label="Category" />
          <input name="brand" defaultValue="Apple" className="rounded-full bg-canvas px-4 py-2" aria-label="Brand" />
          <input name="model" defaultValue="iPhone 13" className="rounded-full bg-canvas px-4 py-2" aria-label="Model" />
          <select name="condition" defaultValue="good" className="rounded-full bg-canvas px-4 py-2" aria-label="Condition">
            {["new", "like_new", "good", "fair", "poor"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <select name="role" defaultValue="seller" className="rounded-full bg-canvas px-4 py-2" aria-label="Your role">
            <option value="seller">I&apos;m the seller</option>
            <option value="buyer">I&apos;m the buyer</option>
          </select>
          <button className="rounded-full bg-ink-button px-4 py-2 font-bold text-on-ink-button">Start</button>
        </form>

        <div className="text-sm">
          <p className="mb-2 font-bold">Your negotiations</p>
          {saved.length === 0 && <p className="text-steel">None yet.</p>}
          {saved.map((s) => (
            <button key={`${s.id}-${s.role}`} onClick={() => open(s)}
              className={`mb-1 block w-full rounded-2xl px-3 py-2 text-left ${active?.id === s.id && active.role === s.role ? "bg-ink-deep text-canvas" : "bg-surface-soft"}`}>
              {s.title} <span className="opacity-70">· {s.role}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col rounded-4xl border border-hairline-soft">
        {error && <p className="m-4 rounded-2xl bg-orange-100 p-3 text-sm">{error}</p>}
        {!active && <p className="m-auto text-steel">Start or open a negotiation.</p>}
        {active && !session && !error && <p className="m-auto text-steel">Loading…</p>}
        {session && <ChatWindow session={session} invite={invite} act={act} />}
      </section>
    </main>
  );
}

function ChatWindow({ session, invite, act }: {
  session: Session; invite: string | null; act: (path: string, body: unknown, method?: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [limit, setLimit] = useState("");
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
        <h1 className="mt-1 text-xl font-semibold">{session.item.brand} {session.item.model} <span className="text-steel">({session.item.condition})</span></h1>
        {session.price_report.p50 !== null && <p className="text-sm text-steel">Market average {money(session.price_report.p50)} from {session.price_report.n_sold} sales</p>}
        {invite && <p className="mt-2 break-all rounded-2xl bg-emerald-100 p-3 text-xs">Send this link to the other side (open it in another browser/incognito to test):<br /><strong>{invite}</strong></p>}
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-5">
        {session.messages.map((m, i) => {
          const mine = m.sender === me || m.sender === `${me}_agent`;
          const system = m.sender === "system";
          return (
            <div key={i} className={`max-w-[80%] ${system ? "self-center text-center" : mine ? "self-end" : "self-start"}`}>
              <p className="mb-0.5 text-[10px] font-bold tracking-wider text-steel">{who(m.sender)}</p>
              <p className={`rounded-2xl px-4 py-2 text-sm ${system ? "bg-surface-soft text-charcoal" : mine ? "bg-ink-deep text-canvas" : "bg-violet-100"}`}>{m.text}</p>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <footer className="flex flex-col gap-3 border-t border-hairline-soft p-4">
        {!session.you_submitted_bound && session.status === "collecting_bounds" && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act("/bound", { amount: Number(limit) }, "PUT"); }}>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" min="1" step="0.01" required
              placeholder={me === "buyer" ? "Most you'll pay (private)" : "Least you'll accept (private)"}
              className="flex-1 rounded-full bg-surface-soft px-4 py-2 text-sm" />
            <button className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary">Set limit</button>
          </form>
        )}
        {session.you_submitted_bound && session.status === "collecting_bounds" && (
          <p className="text-sm text-steel">Your private limit is in. Waiting for the other side…</p>
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
