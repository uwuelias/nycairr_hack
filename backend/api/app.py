"""Negotiation API. All state lives in agents/negotiation/sessions.db, so sessions
survive page reloads and server restarts.

Run from the backend/ folder:   python -m api.app
"""
import json, os, sqlite3

from flask import Flask, jsonify, request
from pydantic import ValidationError

from agents.research.schema import ListingQuery
from agents.negotiation.alternating import negotiate
import agents.negotiation.store as store

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LISTING_DB = os.path.join(BACKEND_DIR, "data", "listing.db")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")


def market_report(q: ListingQuery) -> dict:
    """Mean sold price for this brand/model/condition (simple stand-in for pricing.research)."""
    with sqlite3.connect(LISTING_DB) as c:
        n, avg = c.execute(
            "SELECT count(*), avg(price) FROM price_observations WHERE price_type = 'sold' "
            "AND lower(brand) = lower(?) AND lower(model) = lower(?) AND condition = ?",
            (q.brand, q.model, q.condition)).fetchone()
    return {"p50": round(avg, 2) if n else None, "n_sold": n}


def create_app():
    store.init()
    app = Flask(__name__)

    def err(msg, code=400):
        return jsonify({"error": msg}), code

    @app.after_request
    def cors(resp):  # lets the Next.js dev server (port 3000) call this API
        resp.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Session-Token"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return resp

    def authed(session_id):
        s = store.get(session_id)
        if not s:
            return None, None, err("session not found", 404)
        role = store.role_for_token(s, request.headers.get("X-Session-Token"))
        if not role:
            return None, None, err("invalid or missing X-Session-Token", 403)
        return s, role, None

    def view(s, role):
        """What a side is allowed to see. Never the other side's limit."""
        mine = s["buyer_max"] if role == "buyer" else s["seller_min"]
        theirs = s["seller_min"] if role == "buyer" else s["buyer_max"]
        my_resp = s["buyer_approval"] if role == "buyer" else s["seller_approval"]
        return {
            "session_id": s["id"], "role": role, "status": s["status"],
            "item": json.loads(s["query"]), "price_report": json.loads(s["report"]),
            "your_limit": mine, "other_submitted_limit": theirs is not None,
            "proposed_price": s["proposed_price"], "agreed_price": s["agreed_price"],
            "you_responded": None if my_resp is None else bool(my_resp),
            "messages": json.loads(s["messages"] or "[]"),
        }

    def body():
        return request.get_json(silent=True) or {}

    # ---- endpoints -------------------------------------------------------

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.post("/sessions")
    def create_session():
        """Body: {"item": {category, brand, model, condition}}. Returns both tokens once."""
        try:
            q = ListingQuery(**body().get("item", {}))
        except ValidationError as e:
            return err(e.errors(include_url=False))
        report = market_report(q)
        s = store.create_session(q.model_dump(), report)
        title = f"{q.brand} {q.model} ({q.condition})"
        market = f"Recent sales average ${report['p50']:,.2f}." if report["p50"] else "No recent sales data."
        store.add_messages(s["id"], [{"sender": "system", "text": f"Negotiation opened for {title}. {market} "
                                      "Both sides: set your private limit to let the agents start."}])
        return jsonify({"session_id": s["id"], "buyer_token": s["buyer_token"],
                        "seller_token": s["seller_token"]}), 201

    @app.get("/sessions/<session_id>")
    def get_session(session_id):
        """Full persisted state + chat history for the caller's side."""
        s, role, e = authed(session_id)
        return e or jsonify(view(s, role))

    @app.post("/sessions/<session_id>/messages")
    def post_message(session_id):
        """Free-text chat between the humans. Body: {"text": "..."}"""
        s, role, e = authed(session_id)
        if e:
            return e
        text = str(body().get("text", "")).strip()[:1000]
        if not text:
            return err("text is required")
        store.add_messages(session_id, [{"sender": role, "text": text}])
        return jsonify(view(store.get(session_id), role))

    @app.post("/sessions/<session_id>/limit")
    def set_limit(session_id):
        """Private limit: buyer max / seller min. Body: {"amount": 250}. Once both are in, agents negotiate."""
        s, role, e = authed(session_id)
        if e:
            return e
        try:
            amount = round(float(body().get("amount")), 2)
            assert amount > 0
        except (TypeError, ValueError, AssertionError):
            return err("amount must be a positive number")
        if not store.set_bound(session_id, role, amount):
            return err("you already set your limit", 409)
        store.add_messages(session_id, [{"sender": "system", "text": f"The {role} set a private limit."}])
        store.log(session_id, role, "limit_set")

        s = store.get(session_id)
        if s["buyer_max"] is not None and s["seller_min"] is not None and s["status"] == "collecting_bounds":
            result = negotiate(s["buyer_max"], s["seller_min"], json.loads(s["report"]).get("p50"))
            store.add_messages(session_id, result["messages"])
            if result["price"] is None:
                store.update(session_id, status="no_deal")
            else:
                store.update(session_id, status="awaiting_approval", proposed_price=result["price"])
                store.add_messages(session_id, [{"sender": "system", "price": result["price"],
                    "text": f"The agents converged on ${result['price']:,.2f}. Both sides: accept or decline."}])
            store.log(session_id, "agents", "negotiated")
        return jsonify(view(store.get(session_id), role))

    @app.post("/sessions/<session_id>/respond")
    def respond(session_id):
        """Accept or decline the agents' price. Body: {"accept": true}"""
        s, role, e = authed(session_id)
        if e:
            return e
        if s["status"] != "awaiting_approval":
            return err("nothing to respond to yet", 409)
        accept = bool(body().get("accept"))
        if not store.set_approval(session_id, role, accept):
            return err("you already responded", 409)
        store.add_messages(session_id, [{"sender": "system",
                                         "text": f"The {role} {'accepted' if accept else 'declined'}."}])
        s = store.get(session_id)
        if not accept:
            store.update(session_id, status="no_deal")
        elif s["buyer_approval"] and s["seller_approval"]:
            store.update(session_id, status="agreed", agreed_price=s["proposed_price"])
            store.add_messages(session_id, [{"sender": "system", "price": s["proposed_price"],
                                             "text": f"Deal at ${s['proposed_price']:,.2f}!"}])
        store.log(session_id, role, "accepted" if accept else "declined")
        return jsonify(view(store.get(session_id), role))

    return app


if __name__ == "__main__":
    create_app().run(port=5000, debug=True)
