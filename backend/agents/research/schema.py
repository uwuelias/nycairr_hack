from typing import Literal
from pydantic import BaseModel, Field

Condition = Literal["new", "like_new", "good", "fair", "poor"]

class ListingQuery(BaseModel):
    category: str
    brand: str
    model: str
    condition: Condition
    attributes: dict[str, str] = Field(default_factory=dict)


class Comp(BaseModel):
    comp_id: str
    price: float                     
    adjusted_price: float             
    price_type: Literal["sold", "asking"]
    date: str
    similarity: float


class PriceReport(BaseModel):
    query: ListingQuery
    p10: float | None = None
    p50: float | None = None
    p90: float | None = None
    n_comps: int = 0
    n_sold: int = 0
    confidence: Literal["high", "medium", "low", "insufficient"] = "insufficient"
    basis: str = ""                   
    comps_used: list[Comp] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
