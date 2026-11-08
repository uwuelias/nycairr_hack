"""Alternating-offers negotiation between a buyer agent and a seller agent.

Each agent only knows its OWN private limit (buyer_max / seller_min) plus the public
market price. They take turns: buyer offers, seller counters, buyer counters, ...
Each agent concedes linearly from its opening offer toward its limit over ROUNDS turns.
As soon as one side's next offer would meet or cross the other side's last offer,
it accepts that last offer instead. Deterministic, no LLM, so it is easy to test.
"""

ROUNDS = 5  # turns per side before an agent reaches its limit


def _open_buyer(buyer_max: float, market: float | None) -> float:
    return round(min(buyer_max, 0.8 * (market or buyer_max)), 2)


def _open_seller(seller_min: float, market: float | None) -> float:
    return round(max(seller_min, 1.2 * (market or seller_min)), 2)


def _offer(opening: float, limit: float, turn: int) -> float:
    """Offer for a side's `turn` (0-based): moves from opening to limit by the last turn."""
    return round(opening + (limit - opening) * min(turn / (ROUNDS - 1), 1.0), 2)


def negotiate(buyer_max: float, seller_min: float, market: float | None) -> dict:
    """Run the whole exchange. Returns {"messages": [...], "price": float | None}."""
    b_open, s_open = _open_buyer(buyer_max, market), _open_seller(seller_min, market)
    msgs: list[dict] = []
    last = {"buyer": None, "seller": None}

    for turn in range(ROUNDS):
        for side in ("buyer", "seller"):
            other = "seller" if side == "buyer" else "buyer"
            mine = _offer(b_open, buyer_max, turn) if side == "buyer" else _offer(s_open, seller_min, turn)
            theirs = last[other]
            crossed = theirs is not None and (mine >= theirs if side == "buyer" else mine <= theirs)
            if crossed:
                msgs.append({"sender": f"{side}_agent", "price": theirs,
                             "text": f"I can accept ${theirs:,.2f}."})
                return {"messages": msgs, "price": theirs}
            verb = "I'd offer" if side == "buyer" else "I'm asking"
            if last[side] == mine:  # already at limit, nothing left to give
                text = f"${mine:,.2f} is the best I can do."
            else:
                text = f"{verb} ${mine:,.2f}." if turn == 0 else f"How about ${mine:,.2f}?"
            msgs.append({"sender": f"{side}_agent", "price": mine, "text": text})
            last[side] = mine

    msgs.append({"sender": "system", "text": "The agents could not find a price that works for both sides."})
    return {"messages": msgs, "price": None}
