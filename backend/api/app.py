"""Flask API: price reports + broker negotiation, one session per deal.

Each side gets its own token (buyer_token / seller_token). The token decides the role, so a side
can only submit its own bound and can never read the other's.
"""
import math, os
from flask import Flask, jsonify, request, send_from_directory
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import ValidationError
from sqlalchemy import create_engine, text

import agents.negotiation.store as store
from agents.negotiation.centralized_broker import broker_graph
from agents.research.pricing import research
from agents.research.schema import ListingQuery


def create_app(market_engine=None):
    store.init()
    app = Flask(__name__)

    engine = market_engine or create_engine("sqlite:///./data/listing.db")

    def item_title(q: ListingQuery) -> str:
        """Title for the LLM prompt comes from OUR catalog, never from user-typed text.
        (condition is a validated enum, so it is safe to include.)"""
        with engine.connect() as c:
            row = c.execute(text("SELECT brand, model FROM price_observations "
                                 "WHERE lower(brand) = lower(:b) AND lower(model) = lower(:m) LIMIT 1"),
                            {"b": q.brand, "m": q.model}).first()
        return f"{row.brand} {row.model} ({q.condition})" if row else f"the item ({q.condition})"

    def err(msg, code):
        return jsonify({"error": msg}), code

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
        import json
        both_in = s["buyer_max"] is not None and s["seller_min"] is not None
        mine = s["buyer_approval"] if role == "buyer" else s["seller_approval"]
        return {
            "session_id": s["id"], "role": role, "status": s["status"],
            "item": json.loads(s["query"]), "price_report": json.loads(s["report"]),
            "you_submitted_bound": (s["buyer_max"] if role == "buyer" else s["seller_min"]) is not None,
            "other_submitted_bound": (s["seller_min"] if role == "buyer" else s["buyer_max"]) is not None,
            "anchor": s["anchor"], "proposed_price": s["proposed_price"],
            "you_responded": None if mine is None else bool(mine),
            "agreed_price": s["agreed_price"], "messages": json.loads(s["messages"] or "[]"),
        }

    def run_graph(s, payload):
        """Start or resume the broker graph; mirror its public output into the store."""
        import json
        cfg = {"configurable": {"thread_id": s["id"]}}
        report = json.loads(s["report"])
        out = broker_graph.invoke(payload if payload is not None else {
            "messages": [HumanMessage(content="Negotiation started")], "session_id": s["id"],
            "item_title": item_title(ListingQuery(**json.loads(s["query"]))),
            "market_p50": report.get("p50"), "status": "pending"}, cfg)
        fields = {"messages": json.dumps([m.content for m in out["messages"][1:]])}
        if "__interrupt__" in out:
            fields.update(status="awaiting_approval", proposed_price=out["__interrupt__"][0].value["proposed_price"],
                          anchor="market" if report.get("p50") is not None else "midpoint")
        else:
            fields["status"] = out["status"]
            if out["status"] == "agreed":
                fields["agreed_price"] = out["agreed_price"]
        store.update(s["id"], **fields)
        store.log(s["id"], "broker", fields["status"])

    # ---------- routes ----------
    @app.get("/")
    def demo():
        return send_from_directory(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"), "demo.html")

    @app.post("/api/research/price")
    def price():
        try:
            q = ListingQuery.model_validate(request.get_json(force=True))
        except ValidationError as e:
            return err(e.errors(include_url=False, include_context=False).__repr__(), 422)
        return jsonify(research(engine, q).model_dump())

    @app.post("/api/sessions")
    def create_session():
        try:
            q = ListingQuery.model_validate((request.get_json(force=True) or {}).get("query"))
        except ValidationError:
            return err("body must be {\"query\": {category, brand, model, condition, attributes}}", 422)
        report = research(engine, q).model_dump()          # ONE report, shared by both sides
        s = store.create_session(q.model_dump(), report)
        return jsonify({"session_id": s["id"], "buyer_token": s["buyer_token"],
                        "seller_token": s["seller_token"], "price_report": report}), 201

    @app.get("/api/sessions/<sid>")
    def get_session(sid):
        s, role, e = authed(sid)
        return e or jsonify(view(s, role))

    @app.put("/api/sessions/<sid>/bound")
    def submit_bound(sid):
        s, role, e = authed(sid)
        if e:
            return e
        amount = (request.get_json(force=True) or {}).get("amount")
        if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not math.isfinite(amount) \
                or not (0 < amount < 10_000_000):
            return err("amount must be a positive number", 422)
        if not store.set_bound(sid, role, round(float(amount), 2)):
            return err("bound already submitted and cannot be changed", 409)
        store.log(sid, role, "bound_submitted")                # note: the amount is NOT logged
        s = store.get(sid)
        if s["buyer_max"] is not None and s["seller_min"] is not None:
            run_graph(s, None)
            s = store.get(sid)
        return jsonify(view(s, role))

    @app.post("/api/sessions/<sid>/respond")
    def respond(sid):
        s, role, e = authed(sid)
        if e:
            return e
        if s["status"] != "awaiting_approval":
            return err(f"session is '{s['status']}', nothing to approve", 409)
        approve = (request.get_json(force=True) or {}).get("approve")
        if not isinstance(approve, bool):
            return err("approve must be true or false", 422)
        col = "buyer_approval" if role == "buyer" else "seller_approval"
        if s[col] is not None:
            return err("already responded", 409)
        store.update(sid, **{col: int(approve)})
        store.log(sid, role, "approved" if approve else "declined")
        s = store.get(sid)
        if s["buyer_approval"] is not None and s["seller_approval"] is not None:
            run_graph(s, Command(resume={"buyer": bool(s["buyer_approval"]), "seller": bool(s["seller_approval"])}))
            s = store.get(sid)
        return jsonify(view(s, role))

    return app


if __name__ == "__main__":
    create_app().run(debug=True, port=5000)