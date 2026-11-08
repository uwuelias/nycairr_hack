import json, os, secrets, sqlite3, time, uuid

# Absolute path so the DB is the same file no matter which directory the server is started from.
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sessions.db")
COLUMNS = {"buyer_max", "seller_min", "buyer_approval", "seller_approval", "status",
           "proposed_price", "agreed_price", "anchor", "messages"}

def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY, query TEXT, report TEXT, buyer_token TEXT, seller_token TEXT,
            buyer_max REAL, seller_min REAL, buyer_approval INTEGER, seller_approval INTEGER,
            status TEXT, proposed_price REAL, agreed_price REAL, anchor TEXT,
            messages TEXT DEFAULT '[]', created_at REAL);
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, ts REAL,
            actor TEXT, event TEXT, detail TEXT);""")


def create_session(query: dict, report: dict) -> dict:
    s = {"id": uuid.uuid4().hex[:12], "buyer_token": secrets.token_urlsafe(24),
         "seller_token": secrets.token_urlsafe(24)}
    with _conn() as c:
        c.execute("INSERT INTO sessions (id, query, report, buyer_token, seller_token, status, created_at) "
                  "VALUES (?,?,?,?,?,?,?)",
                  (s["id"], json.dumps(query), json.dumps(report), s["buyer_token"],
                   s["seller_token"], "collecting_bounds", time.time()))
    log(s["id"], "system", "session_created")
    return s


def get(session_id: str):
    with _conn() as c:
        r = c.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return dict(r) if r else None


def role_for_token(session, token: str | None):
    if not token:
        return None
    if secrets.compare_digest(token, session["buyer_token"]):
        return "buyer"
    if secrets.compare_digest(token, session["seller_token"]):
        return "seller"
    return None


def set_bound(session_id: str, role: str, amount: float) -> bool:
    """One submission per side; returns False if that side already submitted."""
    col = "buyer_max" if role == "buyer" else "seller_min"
    with _conn() as c:
        cur = c.execute(f"UPDATE sessions SET {col} = ? WHERE id = ? AND {col} IS NULL", (amount, session_id))
    return cur.rowcount == 1


def get_bounds(session_id: str) -> dict:
    s = get(session_id)
    return {"buyer_max": s["buyer_max"], "seller_min": s["seller_min"]}


def update(session_id: str, **fields):
    assert set(fields) <= COLUMNS, f"unknown column(s): {set(fields) - COLUMNS}"
    with _conn() as c:
        c.execute(f"UPDATE sessions SET {', '.join(k + ' = ?' for k in fields)} WHERE id = ?",
                  (*fields.values(), session_id))


def add_messages(session_id: str, new: list[dict]):
    """Append chat messages ({sender, text, price?}) to the session's persisted history."""
    with _conn() as c:  # one transaction: read + write together
        row = c.execute("SELECT messages FROM sessions WHERE id = ?", (session_id,)).fetchone()
        msgs = json.loads(row["messages"] or "[]")
        msgs.extend({**m, "ts": time.time()} for m in new)
        c.execute("UPDATE sessions SET messages = ? WHERE id = ?", (json.dumps(msgs), session_id))


def set_approval(session_id: str, role: str, accept: bool) -> bool:
    """One response per side; returns False if that side already responded."""
    col = "buyer_approval" if role == "buyer" else "seller_approval"
    with _conn() as c:
        cur = c.execute(f"UPDATE sessions SET {col} = ? WHERE id = ? AND {col} IS NULL",
                        (int(accept), session_id))
    return cur.rowcount == 1


def log(session_id: str, actor: str, event: str, detail: str = ""):
    """Audit trail. Never pass bounds in `detail`."""
    with _conn() as c:
        c.execute("INSERT INTO events (session_id, ts, actor, event, detail) VALUES (?,?,?,?,?)",
                  (session_id, time.time(), actor, event, detail))