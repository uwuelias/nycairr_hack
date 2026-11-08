"""Flask API: price reports + alternating-offers negotiation, one session per deal.

Each side gets its own token (buyer_token / seller_token). The token decides the role, so a side
can only submit its own bound and can never read the other's. All session state (bounds, agent
offers, chat, approvals) lives in agents/negotiation/sessions.db, so it survives restarts.

Run from the backend/ folder:   python -m api.app
"""
import json, math, os
from datetime import datetime

from flask import Flask, jsonify, request
from pydantic import ValidationError
from sqlalchemy import create_engine, text

import agents.negotiation.store as store
from agents.negotiation.alternating import negotiate
from agents.research.pricing import research
from agents.research.schema import ListingQuery

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

    @app.after_request
    def cors(resp):  # lets the Next.js dev server (port 3000) call this API
        resp.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-Token"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, OPTIONS"
        return resp

    def item_title(q: dict) -> str:
        """Title comes from OUR catalog, never from user-typed text.
        (condition is a validated enum, so it is safe to include.)"""
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

    @app.post("/api/sessions")
    def create_session():
        try:
            q = ListingQuery.model_validate(body().get("query"))
        except ValidationError:
            return err("body must be {\"query\": {category, brand, model, condition, attributes}}", 422)
        report = research(engine, q, as_of=as_of).model_dump()   # ONE report, shared by both sides
        s = store.create_session(q.model_dump(), report)
        p50 = report.get("p50")
        market = f"Recent sales average ${p50:,.2f}." if p50 is not None else "Not enough recent sales data."
        store.add_messages(s["id"], [{"sender": "system", "text":
            f"Negotiation opened for {item_title(q.model_dump())}. {market} "
            "Both sides: submit your private limit to let the agents start."}])
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
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) \
                or not (0 < amount < 10_000_000):
            return err("amount must be a positive number", 422)
        if not store.set_bound(sid, role, round(float(amount), 2)):
            return err("bound already submitted and cannot be changed", 409)
        store.log(sid, role, "bound_submitted")                # note: the amount is NOT logged
        store.add_messages(sid, [{"sender": "system", "text": f"The {role} submitted a private limit."}])
        s = store.get(sid)
        if s["buyer_max"] is not None and s["seller_min"] is not None and s["status"] == "collecting_bounds":
            run_negotiation(s)
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
