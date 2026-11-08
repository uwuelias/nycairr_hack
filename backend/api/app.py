"""Flask API: price reports + alternating-offers negotiation, one session per deal.

Each side gets its own token (buyer_token / seller_token). The token decides the role, so a side
can only submit its own bound and can never read the other's. All session state (bounds, agent
offers, chat, approvals) lives in agents/negotiation/sessions.db, so it survives restarts.

Run from the backend/ folder:   python -m api.app
"""
import collections, json, math, os, re
from datetime import datetime

from flask import Flask, jsonify, request
from pydantic import ValidationError
from sqlalchemy import create_engine, text

import agents.negotiation.store as store
from agents.negotiation.alternating import negotiate
from agents.research.pricing import research
from agents.research.schema import ListingQuery
from services.run_logging import REVIEW_LOG, RUN_DIR

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LISTING_DB = os.path.join(BACKEND_DIR, "data", "listing.db")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")


def create_app(market_engine=None):
    store.init()
    app = Flask(__name__)

    engine = market_engine or create_engine(f"sqlite:///{LISTING_DB}")
    # Price windows are measured back from the newest data we have, not today's date,
    # so the bundled sample data still produces reports.
    with engine.connect() as c:
        latest = c.execute(text("SELECT max(fetched_at) FROM price_observations")).scalar()
    as_of = datetime.fromisoformat(latest) if latest else None

    def err(msg, code):
        return jsonify({"error": msg}), code

    def body():
        return request.get_json(silent=True) or {}

    def evaluation_runs():
        if not RUN_DIR.exists():
            return []
        runs = []
        for path in sorted(RUN_DIR.glob("claims_*.json"), reverse=True):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if isinstance(record, dict):
                runs.append((path, record))
        return runs

    def evaluation_reviews():
        if not REVIEW_LOG.exists():
            return []
        entries = []
        with REVIEW_LOG.open(encoding="utf-8") as review_file:
            for line in review_file:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(entry, dict):
                    entries.append(entry)
        return entries

    def evaluation_claims(record, key):
        section = record.get(key) or {}
        return section.get("claims", []) if isinstance(section, dict) else []

    def evaluation_category(record):
        for claim in evaluation_claims(record, "normalized"):
            if claim.get("attribute") == "category" and claim.get("value"):
                return str(claim["value"]).strip().lower()
        return "unknown"

    def asserted_model(claims):
        return any(
            claim.get("attribute") == "model"
            and claim.get("status") in {"observed", "inferred"}
            and claim.get("value")
            for claim in claims
        )

    def summarize_reviews(entries):
        by_attribute = collections.defaultdict(collections.Counter)
        by_category = collections.defaultdict(collections.Counter)
        totals = collections.Counter()
        for entry in entries:
            decision = entry.get("decision")
            if decision not in {"accepted", "rejected", "supplied"}:
                continue
            totals[decision] += 1
            by_attribute[entry.get("attribute") or "unknown"][decision] += 1
            by_category[entry.get("category") or "unknown"][decision] += 1

        def rows(groups):
            output = []
            for key, counts in sorted(groups.items()):
                decided = counts["accepted"] + counts["rejected"]
                output.append({
                    "key": key,
                    "accepted": counts["accepted"],
                    "rejected": counts["rejected"],
                    "seller_supplied": counts["supplied"],
                    "rejection_rate": round(counts["rejected"] / decided, 4) if decided else None,
                })
            return output

        return {
            "totals": {key: totals[key] for key in ("accepted", "rejected", "supplied")},
            "by_attribute": rows(by_attribute),
            "by_category": rows(by_category),
        }

    @app.get("/api/evaluation/summary")
    def evaluation_summary():
        runs = evaluation_runs()
        reviews = evaluation_reviews()
        statuses = ("observed", "inferred", "unknown", "requires_user_confirmation", "seller_confirmed")
        status_counts = {
            source: collections.Counter(
                claim.get("status")
                for _, record in runs
                for claim in evaluation_claims(record, source)
            )
            for source in ("raw_model_output", "normalized")
        }
        actions = collections.Counter(
            correction.get("action")
            for _, record in runs
            for correction in record.get("corrections", [])
            if correction.get("action")
        )
        seconds = [record["seconds"] for _, record in runs if isinstance(record.get("seconds"), (int, float))]
        categories = collections.defaultdict(list)
        for _, record in runs:
            categories[evaluation_category(record)].append(record)

        by_category = []
        for category, group in sorted(categories.items()):
            raw_observed = sum(
                claim.get("status") == "observed"
                for record in group for claim in evaluation_claims(record, "raw_model_output")
            )
            guarded_observed = sum(
                claim.get("status") == "observed"
                for record in group for claim in evaluation_claims(record, "normalized")
            )
            by_category.append({
                "category": category,
                "runs": len(group),
                "corrections_per_run": round(sum(len(r.get("corrections", [])) for r in group) / len(group), 2),
                "observed_claims_raw": raw_observed,
                "observed_claims_after_guards": guarded_observed,
            })

        raw_model_runs = sum(asserted_model(evaluation_claims(record, "raw_model_output")) for _, record in runs)
        guarded_model_runs = sum(asserted_model(evaluation_claims(record, "normalized")) for _, record in runs)
        return jsonify({
            "run_count": len(runs),
            "average_seconds": round(sum(seconds) / len(seconds), 2) if seconds else None,
            "claim_status_counts": {
                source: {status: count[status] for status in statuses}
                for source, count in status_counts.items()
            },
            "guard_interventions": [
                {"action": action, "count": count, "per_run": round(count / len(runs), 2) if runs else 0}
                for action, count in actions.most_common()
            ],
            "model_identification": {
                "runs_asserting_model": raw_model_runs,
                "ocr_corroborated": actions["model_corroborated_by_ocr"],
                "unsupported_model_downgrades": actions["downgraded_unverified_model"],
                "runs_asserting_model_after_guards": guarded_model_runs,
            },
            "by_category": by_category,
            "seller_reviews": summarize_reviews(reviews),
        })

    @app.get("/api/evaluation/runs")
    def evaluation_run_list():
        try:
            limit = min(max(int(request.args.get("limit", 50)), 1), 100)
            offset = max(int(request.args.get("offset", 0)), 0)
        except ValueError:
            return err("limit and offset must be integers.", 400)
        category_filter = request.args.get("category", "").strip().lower()
        runs = []
        for path, record in evaluation_runs():
            category = evaluation_category(record)
            if category_filter and category != category_filter:
                continue
            raw = evaluation_claims(record, "raw_model_output")
            normalized = evaluation_claims(record, "normalized")
            runs.append({
                "run_id": path.stem,
                "kind": record.get("kind", "claims"),
                "timestamp": record.get("timestamp"),
                "seconds": record.get("seconds"),
                "category": category,
                "image_count": len(record.get("images", [])),
                "correction_count": len(record.get("corrections", [])),
                "model_asserted": asserted_model(raw),
                "model_asserted_after_guards": asserted_model(normalized),
            })
        return jsonify({"runs": runs[offset:offset + limit], "total": len(runs), "limit": limit, "offset": offset})

    @app.get("/api/evaluation/runs/<run_id>")
    def evaluation_run_detail(run_id):
        if not re.fullmatch(r"claims_[A-Za-z0-9_-]+", run_id):
            return err("Run not found.", 404)
        try:
            record = json.loads((RUN_DIR / f"{run_id}.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return err("Run not found.", 404)
        if not isinstance(record, dict):
            return err("Run not found.", 404)
        return jsonify({**record, "run_id": run_id})

    @app.get("/api/evaluation/reviews")
    def evaluation_review_list():
        try:
            limit = min(max(int(request.args.get("limit", 50)), 1), 100)
            offset = max(int(request.args.get("offset", 0)), 0)
        except ValueError:
            return err("limit and offset must be integers.", 400)
        reviews = list(reversed(evaluation_reviews()))
        return jsonify({"reviews": reviews[offset:offset + limit], "total": len(reviews), "limit": limit, "offset": offset})

    @app.after_request
    def cors(resp):  # lets the Next.js dev server (port 3000) call this API
        resp.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-Token"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
        return resp

    def item_title(q: dict) -> str:
        """Title comes from OUR catalog, never from user-typed text.
        (condition is a validated enum, so it is safe to include.)"""
        if q.get("listing_title"):
            return q["listing_title"]
        with engine.connect() as c:
            row = c.execute(text("SELECT brand, model FROM price_observations "
                                 "WHERE lower(brand) = lower(:b) AND lower(model) = lower(:m) LIMIT 1"),
                            {"b": q["brand"], "m": q["model"]}).first()
        return f"{row.brand} {row.model} ({q['condition']})" if row else f"the item ({q['condition']})"

    def authed(session_id):
        s = store.get(session_id)
        if not s:
            return None, None, err("session not found", 404)
        role = store.role_for_token(s, request.headers.get("X-Session-Token"))
        if not role:
            return None, None, err("invalid or missing X-Session-Token", 403)
        return s, role, None

    def view(s, role):
        """What a side is allowed to see. No bounds, ever (not even its own)."""
        both_in = s["buyer_max"] is not None and s["seller_min"] is not None
        mine = s["buyer_approval"] if role == "buyer" else s["seller_approval"]
        return {
            "session_id": s["id"], "role": role, "status": s["status"],
            "item": json.loads(s["query"]), "price_report": json.loads(s["report"]),
            "you_submitted_bound": (s["buyer_max"] if role == "buyer" else s["seller_min"]) is not None,
            "other_submitted_bound": (s["seller_min"] if role == "buyer" else s["buyer_max"]) is not None,
            "you_agent_enabled": bool(s.get("buyer_agent" if role == "buyer" else "seller_agent", 0)),
            "other_agent_enabled": bool(s.get("seller_agent" if role == "buyer" else "buyer_agent", 0)),
            "both_submitted": both_in,
            "anchor": s["anchor"], "proposed_price": s["proposed_price"],
            "you_responded": None if mine is None else bool(mine),
            "agreed_price": s["agreed_price"], "messages": json.loads(s["messages"] or "[]"),
        }

    def run_negotiation(s):
        """Both bounds are in: let the buyer and seller agents trade offers, persist the result."""
        report = json.loads(s["report"])
        result = negotiate(s["buyer_max"], s["seller_min"], report.get("p50"))
        store.add_messages(s["id"], result["messages"])
        if result["price"] is None:
            store.update(s["id"], status="no_deal")
        else:
            store.update(s["id"], status="awaiting_approval", proposed_price=result["price"],
                         anchor="market" if report.get("p50") is not None else "limits")
            store.add_messages(s["id"], [{"sender": "system", "price": result["price"],
                "text": f"The agents converged on ${result['price']:,.2f}. Both sides: approve or decline."}])
        store.log(s["id"], "agents", "negotiated")

    def start_agents_if_ready(s):
        if (s["buyer_max"] is None or s["seller_min"] is None or
                not s.get("buyer_agent", 0) or not s.get("seller_agent", 0)):
            return False
        run_negotiation(s)
        return True

    # ---------- routes ----------
    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.post("/api/research/price")
    def price():
        try:
            q = ListingQuery.model_validate(body())
        except ValidationError as e:
            return err(e.errors(include_url=False, include_context=False).__repr__(), 422)
        return jsonify(research(engine, q, as_of=as_of).model_dump())

    @app.post("/api/research/price-for-listing")
    def price_for_listing():
        """Resolve a marketplace title to a known model, then run the standard pricing research."""
        payload = body()
        title = payload.get("title")
        category = payload.get("category")
        condition = payload.get("condition")
        if not isinstance(title, str) or not title.strip() or len(title) > 300:
            return err("title must be a non-empty string of 300 characters or fewer", 422)
        if not isinstance(category, str) or not category.strip() or len(category) > 80:
            return err("category must be a non-empty string of 80 characters or fewer", 422)
        if not isinstance(condition, str) or condition not in {"new", "like_new", "good", "fair", "poor"}:
            return err("condition is required to estimate a fair price", 422)

        def normalized(value):
            return "".join(character.lower() for character in value if character.isalnum())

        with engine.connect() as connection:
            catalog = connection.execute(text(
                "SELECT DISTINCT brand, model FROM price_observations "
                "WHERE lower(category) = lower(:category)"
            ), {"category": category.strip()}).all()

        normalized_title = normalized(title)
        matches = [row for row in catalog if normalized(row.model) in normalized_title]
        if not matches:
            return err("This listing title does not match a researched brand and model.", 404)
        matches.sort(key=lambda row: (len(normalized(row.model)), normalized(row.brand) in normalized_title), reverse=True)
        match = matches[0]
        try:
            query = ListingQuery.model_validate({
                "category": category.strip(), "brand": match.brand,
                "model": match.model, "condition": condition,
            })
        except ValidationError as e:
            return err(e.errors(include_url=False, include_context=False).__repr__(), 422)
        return jsonify(research(engine, query, as_of=as_of).model_dump())

    @app.post("/api/sessions")
    def create_session():
        payload = body()
        try:
            q = ListingQuery.model_validate(payload.get("query"))
        except ValidationError:
            return err("body must be {\"query\": {category, brand, model, condition, attributes}}", 422)
        listing_title = payload.get("listing_title")
        if listing_title is not None and (not isinstance(listing_title, str) or not listing_title.strip() or len(listing_title) > 120):
            return err("listing_title must be a non-empty string of 120 characters or fewer", 422)
        report = research(engine, q, as_of=as_of).model_dump()   # ONE report, shared by both sides
        stored_query = q.model_dump()
        if listing_title:
            stored_query["listing_title"] = listing_title.strip()
        s = store.create_session(stored_query, report)
        p50 = report.get("p50")
        market = f"Recent sales average ${p50:,.2f}." if p50 is not None else "Not enough recent sales data."
        store.add_messages(s["id"], [{"sender": "system", "text":
            f"Negotiation opened for {item_title(stored_query)}. {market} "
            "Both sides: submit a private limit. You can opt in to agent negotiation or chat directly."}])
        return jsonify({"session_id": s["id"], "buyer_token": s["buyer_token"],
                        "seller_token": s["seller_token"], "price_report": report}), 201

    @app.get("/api/sessions/<sid>")
    def get_session(sid):
        s, role, e = authed(sid)
        return e or jsonify(view(s, role))

    @app.post("/api/sessions/<sid>/messages")
    def post_message(sid):
        """Free-text chat between the two people. Body: {"text": "..."}"""
        s, role, e = authed(sid)
        if e:
            return e
        msg = str(body().get("text", "")).strip()[:1000]
        if not msg:
            return err("text is required", 422)
        store.add_messages(sid, [{"sender": role, "text": msg}])
        return jsonify(view(store.get(sid), role))

    @app.put("/api/sessions/<sid>/bound")
    def submit_bound(sid):
        """Private limit: buyer max / seller min. Body: {"amount": 250}"""
        s, role, e = authed(sid)
        if e:
            return e
        amount = body().get("amount")
        use_agent = body().get("use_agent", False)
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) \
                or not (0 < amount < 10_000_000):
            return err("amount must be a positive number", 422)
        if not isinstance(use_agent, bool):
            return err("use_agent must be true or false", 422)
        if not store.set_bound(sid, role, round(float(amount), 2)):
            return err("bound already submitted and cannot be changed", 409)
        store.set_agent_enabled(sid, role, use_agent)
        store.log(sid, role, "bound_submitted")                # note: the amount is NOT logged
        store.add_messages(sid, [{"sender": "system", "text": f"The {role} submitted a private limit."}])
        s = store.get(sid)
        feedback = None
        if role == "buyer":
            market_price = json.loads(s["report"]).get("p50")
            if market_price is not None and amount < market_price * 0.5:
                feedback = (f"That maximum is far below the recent sold-price average of "
                            f"${market_price:,.2f}. The seller may be unlikely to accept it; "
                            "consider raising your limit. This suggestion is private to you.")
        if s["buyer_max"] is not None and s["seller_min"] is not None:
            if not start_agents_if_ready(s):
                store.update(sid, status="chatting")
        response = view(store.get(sid), role)
        if feedback:
            response["bound_feedback"] = feedback
        return jsonify(response)

    @app.put("/api/sessions/<sid>/agent")
    def toggle_agent(sid):
        s, role, e = authed(sid)
        if e:
            return e
        if s["status"] not in {"collecting_bounds", "chatting"}:
            return err("agents can only be enabled before a negotiation proposal is made", 409)
        enabled = body().get("enabled")
        if not isinstance(enabled, bool):
            return err("enabled must be true or false", 422)
        store.set_agent_enabled(sid, role, enabled)
        s = store.get(sid)
        if s["buyer_max"] is not None and s["seller_min"] is not None:
            if not start_agents_if_ready(s):
                store.update(sid, status="chatting")
        store.log(sid, role, "agent_enabled" if enabled else "agent_disabled")
        return jsonify(view(store.get(sid), role))

    @app.post("/api/sessions/<sid>/respond")
    def respond(sid):
        """Approve or decline the agents' price. Body: {"approve": true}"""
        s, role, e = authed(sid)
        if e:
            return e
        if s["status"] != "awaiting_approval":
            return err(f"session is '{s['status']}', nothing to approve", 409)
        approve = body().get("approve")
        if not isinstance(approve, bool):
            return err("approve must be true or false", 422)
        if not store.set_approval(sid, role, approve):
            return err("already responded", 409)
        store.log(sid, role, "approved" if approve else "declined")
        store.add_messages(sid, [{"sender": "system", "text": f"The {role} {'approved' if approve else 'declined'}."}])
        s = store.get(sid)
        if not approve:
            store.update(sid, status="no_deal")
            store.add_messages(sid, [{"sender": "system", "text": "No deal this time."}])
        elif s["buyer_approval"] and s["seller_approval"]:
            store.update(sid, status="agreed", agreed_price=s["proposed_price"])
            store.add_messages(sid, [{"sender": "system", "price": s["proposed_price"],
                                      "text": f"Both parties approved. Deal at ${s['proposed_price']:,.2f}!"}])
        return jsonify(view(store.get(sid), role))

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=5000)
