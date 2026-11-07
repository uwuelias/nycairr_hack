from datetime import datetime, timedelta
from sqlalchemy import text


condition = ["new", "good", "fair", "poor"]

SQL = text("""
    SELECT condition, AVG(price) AS avg_price, COUNT(*) AS n
    FROM listings
    WHERE price_type = 'sold'
      AND category = :cat AND lower(brand) = lower(:brand) AND lower(model) = lower(:model)
      AND sold_date >= :since
    GROUP BY condition
""")
 
 
def avg_price_by_condition(engine, category, brand, model, as_of: datetime, days=180):
    since = (as_of - timedelta(days=days)).isoformat()
    with engine.connect() as c:
        rows = c.execute(SQL, {"cat": category, "brand": brand, "model": model, "since": since}).all()
    return {r.condition: {"avg": round(r.avg_price, 2), "n": r.n} for r in rows}

