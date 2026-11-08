"""Pricing: turns simple_comps output (mean sold price per condition) into a PriceReport.

No LLM here. The buyer/seller agents and the explain node only read the report.
"""
from datetime import datetime, timezone
from schema import ListingQuery, PriceReport
from agents.research.comps import avg_price_by_condition
from sqlalchemy import create_engine, text

MIN_N = 5                 
WINDOWS = (180, 365)     
VARIANT_KEYS = ("ram", "storage")


def confidence(n: int) -> str:
    if n >= 20:
        return "high"
    if n >= 10:
        return "medium"
    return "low"


def research(engine, q: ListingQuery, as_of: datetime | None = None) -> PriceReport:
    as_of = as_of or datetime.now(timezone.utc)
    caveats: list[str] = []

    # 1. try the recent window first, widen once if the query's condition has too few sales
    by_cond, days = {}, WINDOWS[0]
    for days in WINDOWS:
        by_cond = avg_price_by_condition(engine, q.category, q.brand, q.model, as_of, days)
        if by_cond.get(q.condition, {}).get("n", 0) >= MIN_N:
            break
    if days > WINDOWS[0] and by_cond.get(q.condition, {}).get("n", 0) >= MIN_N:
        caveats.append(f"Used the last {days} days because recent sales were sparse")

    hit = by_cond.get(q.condition)
    n = hit["n"] if hit else 0

    # 2. not enough data -> say so, and show what the other conditions look like
    if n < MIN_N:
        others = ", ".join(f"{c} (n={v['n']})" for c, v in by_cond.items()) or "none"
        return PriceReport(
            query=q, n_comps=n, n_sold=n, confidence="insufficient",
            basis=f"mean sold price, {days}-day window", condition_averages=by_cond,
            caveats=[f"Fewer than {MIN_N} sold listings in '{q.condition}' condition. "
                     f"Conditions with data: {others}"])

    # 3. the estimate itself: p50 is the mean; this method has no interval
    if any(k in q.attributes for k in VARIANT_KEYS):
        caveats.append("Estimate pools all storage/RAM variants of this model, "
                       "so it may be off for a specific configuration")
    conf = confidence(n)
    if conf == "low":
        caveats.append("Low confidence: small number of recent sales")
    caveats.append("No price range available (mean-based estimate)")

    return PriceReport(
        query=q, p50=hit["avg"], n_comps=n, n_sold=n, confidence=conf,
        basis=f"mean of {n} sold listings, condition={q.condition}, last {days} days",
        condition_averages=by_cond, caveats=caveats)

engine = create_engine("sqlite:///./data/listing.db")

with engine.connect() as c:
    as_of = datetime.fromisoformat(
        c.execute(text("SELECT max(fetched_at) FROM price_observations")).scalar())

tests = [
    # 1. plenty of data: should be confidence "high"
    ListingQuery(category="phones", brand="Apple", model="iPhone 13", condition="good"),

    # 2. thin data (about 9 sales): should be "low"
    ListingQuery(category="phones", brand="Apple", model="iPhone 13", condition="poor"),

    # 3. variant given: should warn that it pools all storage sizes
    ListingQuery(category="laptops", brand="Apple", model="MacBook Air M1",
                 condition="like_new", attributes={"ram": "16GB", "storage": "512GB"}),

    # 4. too little data: should be "insufficient" with no price
    ListingQuery(category="game_consoles", brand="Analogue", model="Pocket", condition="good"),
]

for q in tests:
    r = research(engine, q, as_of=as_of)
    print(q.brand, q.model, q.condition, "->", r.confidence, r.p50, f"(n={r.n_comps})")
    print("  caveats:", r.caveats)
