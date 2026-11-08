from flask import Flask, jsonify, request
import math, os
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import ValidationError
from sqlalchemy import create_engine, text

from agents.research.schema import ListingQuery
from agents.negotiation.centralized_broker import broker_graph
import agents.negotiation.store as store

def create_app(marketEngine = None):
    store.init()
    app = Flask(__name__)

    engine = marketEngine

    def item_title(q: ListingQuery) -> str:
        with engine.connect() as c:
            row = c.execute(text("SELECT brand, model FROM price_observations WHERE lower(brand) = lower(:b) AND lower(model) = lower(:m) LIMIT 1"), {"b": q.brand, "m": q.model}).first()
        return f"{row.brand} {row.model} ({q.condition})" if row else f"the item ({q.condition})"

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


    #api endpoints
    #app.post(/)
    return app

if __name__ == "__main__":
    create_app().run(port=5000)