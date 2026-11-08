"""Single neutral broker. Price selection is deterministic code; the LLM only words the message."""
import operator, os, re
from typing import Annotated, Literal, TypedDict

from langchain_core.messages import BaseMessage, AIMessage, HumanMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama

from agents.negotiation.store import get_bounds 

class BrokerState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], operator.add]   
    session_id: str                
    item_title: str
    market_p50: float | None       
    proposed_price: float
    agreed_price: float
    status: Literal["pending", "awaiting_approval", "agreed", "no_deal"]


def make_llm():
    """Local Ollama by default; set LLM_PROVIDER=openai to switch (needs OPENAI_API_KEY)."""
    if os.getenv("LLM_PROVIDER", "ollama") == "openai":
        return ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    return ChatOllama(model=os.getenv("OLLAMA_MODEL", "llama3.1"), temperature=0.2)

llm = make_llm()

def pick_price(buyer_max: float, seller_min: float, market_p50: float | None = None) -> float:
    """Price inside the overlap [seller_min, buyer_max]."""
    if market_p50 is None:
        return round((buyer_max + seller_min) / 2.0, 2)               # split the difference
    return round(min(max(market_p50, seller_min), buyer_max), 2)      # market price, clamped into overlap


def _numbers_ok(text: str, title: str, allowed: set[float]) -> bool:
    """True only if every number in `text` (apart from the item title) is in `allowed`."""
    found = set()
    for n in re.findall(r"\d[\d,]*\.?\d*", text.replace(title, "")):
        n = n.replace(",", "").rstrip(".")
        if n:
            found.add(round(float(n), 2))
    return found <= {round(a, 2) for a in allowed}


def write_message(title: str, price: float) -> str:
    """LLM writes the wording; code verifies it contains no number except the proposed price."""
    fallback = f"Broker: Based on market data and both parties' limits, ${price:,.2f} is proposed for {title}."
    try:
        out = llm.invoke([SystemMessage(content=(
            f"You are a neutral marketplace broker. Write one or two friendly sentences proposing "
            f"${price:,.2f} for '{title}'. Mention no other numbers and no budgets or minimums."))]).content
        return "Broker: " + out if _numbers_ok(out, title, {price}) else fallback
    except Exception:
        return fallback

def evaluate(state: BrokerState):
    bounds = get_bounds(state["session_id"])
    buyer_max, seller_min = bounds["buyer_max"], bounds["seller_min"]
    if buyer_max < seller_min:
        return {"status": "no_deal",
                "messages": [AIMessage(content="Broker: There is no price that works for both parties.")]}
    return {"status": "awaiting_approval",
            "proposed_price": pick_price(buyer_max, seller_min, state.get("market_p50"))}


def announce(state: BrokerState):
    return {"messages": [AIMessage(content=write_message(state["item_title"], state["proposed_price"]))]}


def await_approval(state: BrokerState):
    reply = interrupt({"item": state["item_title"], "proposed_price": state["proposed_price"]})
    if reply.get("buyer") and reply.get("seller"):
        return {"status": "agreed", "agreed_price": state["proposed_price"],
                "messages": [AIMessage(content=f"Broker: Both parties approved. Deal at ${state['proposed_price']:,.2f}.")]}
    return {"status": "no_deal",
            "messages": [AIMessage(content="Broker: The proposal was not approved by both parties.")]}


def after_evaluate(state: BrokerState) -> Literal["announce", "__end__"]:
    return END if state["status"] == "no_deal" else "announce"


b = StateGraph(BrokerState)
b.add_node("evaluate", evaluate)
b.add_node("announce", announce)
b.add_node("await_approval", await_approval)
b.add_edge(START, "evaluate")
b.add_conditional_edges("evaluate", after_evaluate, ["announce", END])
b.add_edge("announce", "await_approval")
b.add_edge("await_approval", END)
broker_graph = b.compile(checkpointer=MemorySaver())