"use client";

import { useMemo, useState } from "react";

const categories = ["All finds", "Furniture", "Lighting", "Decor", "Tech"];
const listings = [
  { id: 1, name: "The Sunday Lounge", detail: "Mid-century lounge chair · 1960s", price: "$420", category: "Furniture", seller: "Mara’s Objects", emoji: "🪑", color: "bg-violet-100", tag: "RARE FIND" },
  { id: 2, name: "Mushroom Table Lamp", detail: "Murano-style glass · 1970s", price: "$185", category: "Lighting", seller: "Soft Corner", emoji: "🍄", color: "bg-orange-100", tag: "JUST LISTED" },
  { id: 3, name: "Pocket Film Camera", detail: "Olympus XA2 · tested & ready", price: "$210", category: "Tech", seller: "Frame by Frame", emoji: "📷", color: "bg-emerald-100", tag: "GOOD AS NEW" },
  { id: 4, name: "Sunday Morning Vase", detail: "Hand-thrown stoneware · one of one", price: "$68", category: "Decor", seller: "Little Earth Studio", emoji: "🏺", color: "bg-amber-100", tag: "ONE OF ONE" },
];

export default function Home() {
  const [category, setCategory] = useState("All finds");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);
  const visibleListings = useMemo(() => listings.filter((item) => {
    const matchesCategory = category === "All finds" || item.category === category;
    const matchesSearch = `${item.name} ${item.detail} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesCategory && matchesSearch;
  }), [category, search]);

  function toggleFavorite(id: number) {
    setFavorites((current) => current.includes(id) ? current.filter((favorite) => favorite !== id) : [...current, id]);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 text-[#0a1317] sm:px-8 lg:px-12">
      <header className="flex h-20 items-center justify-between border-b border-[#dee3e9]">
        <a className="flex items-center gap-2 text-xl font-bold tracking-tight" href="#top" aria-label="Forme home">
          <span className="grid size-8 place-items-center rounded-full bg-[#0064e0] text-white">f.</span> forme
        </a>
        <nav className="hidden items-center gap-8 text-sm text-[#444950] sm:flex" aria-label="Main navigation">
          <a className="font-semibold text-[#0a1317]" href="#discover">Discover</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <a className="rounded-full bg-black px-6 py-3.5 text-sm font-bold text-white" href="#sell">Start selling ↗</a>
      </header>

      <section id="top" className="grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#5d6c7b]">A marketplace with a new perspective</p>
          <h1 className="mt-6 max-w-xl text-5xl font-medium leading-[1.12] tracking-normal sm:text-[64px]">Good things deserve a second look.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#444950]">Find pre-loved pieces worth keeping. Explore each find in 3D and take a closer look before it finds a new home.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a className="rounded-full bg-black px-7.5 py-3.5 text-sm font-bold text-white" href="#discover">Explore the marketplace ↗</a>
            <a className="rounded-full border-2 border-[#0a1317] px-7 py-3 text-sm font-bold" href="#how-it-works">How it works</a>
          </div>
          <p className="mt-8 text-sm text-[#5d6c7b]"><strong className="text-[#0a1317]">2,400+</strong> good things found a new home</p>
        </div>

        <div className="relative grid min-h-80 place-items-center overflow-hidden rounded-4xl bg-[#f1f4f7] sm:min-h-120">
          <span className="absolute left-5 top-5 rounded-full bg-white px-4 py-2.5 text-[10px] font-bold tracking-widest text-[#444950]">● INTERACTIVE 3D</span>
          <span className="text-[9rem] sm:text-[12rem]" aria-hidden="true">🪑</span>
          <div className="absolute inset-x-5 bottom-5 flex items-center justify-between rounded-2xl bg-white p-5">
            <div><p className="text-[10px] font-bold tracking-widest text-[#5d6c7b]">THE OBJECT NO. 014</p><p className="mt-1 font-semibold">Sunday Lounge Chair</p><p className="text-xs text-[#5d6c7b]">Excellent vintage condition</p></div>
            <strong className="text-lg">$420</strong>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap justify-center gap-x-10 gap-y-3 border-y border-[#dee3e9] py-5 text-sm text-[#444950]">
        <span>✳ See every angle in 3D</span><span>✳ Good things, given a second life</span><span>✳ Thoughtful finds from real people</span>
      </div>

      <section id="discover" className="py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold tracking-[.16em] text-[#5d6c7b]">THE GOOD STUFF</p><h2 className="mt-2 text-3xl font-medium tracking-normal sm:text-5xl">Find your next favorite.</h2></div>
          <a className="text-sm font-semibold" href="#listings">View all finds <span className="text-indigo-600">→</span></a>
        </div>
        <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-4 py-2 text-sm font-bold ${category === item ? "bg-[#0a1317] text-white" : "border border-[#ced0d4] bg-white text-[#1c1e21]"}`}>{item}</button>)}
          </div>
          <input className="w-full rounded-full bg-[#f1f4f7] px-5 py-3 text-sm text-[#1c1e21] outline-none focus:ring-2 focus:ring-[#0064e0] sm:w-72" aria-label="Search listings" placeholder="Search the marketplace" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div id="listings" className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {visibleListings.map((item) => <article key={item.id} className="overflow-hidden rounded-3xl bg-white">
            <div className={`relative grid aspect-square place-items-center rounded-3xl ${item.color}`}>
              <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-[9px] font-bold tracking-wider text-[#444950]">{item.tag}</span>
              <span className="text-7xl" aria-hidden="true">{item.emoji}</span>
              <span className="absolute bottom-3 right-3 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold tracking-wider">↗ VIEW IN 3D</span>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-[#5d6c7b]">{item.detail}</p></div><button type="button" onClick={() => toggleFavorite(item.id)} aria-label={favorites.includes(item.id) ? "Remove from saved items" : "Save item"} aria-pressed={favorites.includes(item.id)} className="grid size-10 shrink-0 place-items-center rounded-full border border-[#dee3e9] text-xl text-[#1c1e21]">{favorites.includes(item.id) ? "♥" : "♡"}</button></div>
              <div className="mt-5 flex justify-between text-sm"><span className="text-[#5d6c7b]">{item.seller}</span><strong>{item.price}</strong></div>
            </div>
          </article>)}
        </div>
        {visibleListings.length === 0 && <p className="py-16 text-center text-[#5d6c7b]">No finds match that search. Try another category or search term.</p>}
      </section>

      <section id="sell" className="mb-12 flex flex-col items-start justify-between gap-6 rounded-4xl bg-[#0a1317] p-8 text-white sm:flex-row sm:items-center sm:p-12">
        <div><p className="text-xs font-bold tracking-widest text-white/70">GOT SOMETHING GOOD?</p><h2 className="mt-2 text-2xl font-medium">Give it a new point of view.</h2><p className="mt-2 text-sm text-white/75">List your piece and give it a new home.</p></div>
        <a className="rounded-full bg-white px-7.5 py-3.5 text-sm font-bold text-[#0a1317]" href="mailto:hello@forme.market">List an item ↗</a>
      </section>

      <footer id="how-it-works" className="flex flex-col gap-2 border-t border-[#dee3e9] py-8 text-sm text-[#5d6c7b] sm:flex-row sm:items-center sm:justify-between">
        <a className="font-bold text-[#0a1317]" href="#top">forme</a><p>A little more life for the things we love.</p><span>© 2025 forme marketplace</span>
      </footer>
    </main>
  );
}
