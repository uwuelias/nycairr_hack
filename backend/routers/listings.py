from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from database.connection import get_db
from database.models import Item, User, Condition
from schemas import ListingOut, ListingCreate, ListingUpdate
from core.security import get_current_user

router = APIRouter(prefix="/listings", tags=["listings"])

def base_query():
    return (
        select(Item)
        .options(joinedload(Item.seller))
        .order_by(Item.created_at.desc())
    )

def available_only(query):
    query.where(Item.listing.status == "available")

def get_owned_item(listing_id: str, db: Session, user: User) -> Item:
    """Fetch an item and make sure the current user owns it."""
    item = db.get(Item, listing_id)
    if not item:
        raise HTTPException(404, "Listing not found")
    if item.user_id != user.user_id:
        raise HTTPException(403, "You can only modify your own listings")
    return item


@router.get("", response_model=list[ListingOut])
def get_all(
    q: str | None = Query(None, max_length=100),
    category: str | None = None,
    brand: str | None = None,
    condition: Condition | None = None,
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = available_only(base_query())
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.where(
            Item.title.ilike(term)
            | Item.description.ilike(term)
            | Item.brand.ilike(term)
            | Item.model.ilike(term)
        )
    if category:
        query = query.where(func.lower(Item.category) == category.lower())
    if brand:
        query = query.where(func.lower(Item.brand) == brand.lower())
    if condition:
        query = query.where(Item.condition == condition)
    if min_price is not None:
        query = query.where(Item.price >= min_price)
    if max_price is not None:
        query = query.where(Item.price <= max_price)
    return db.scalars(query.limit(limit).offset(offset)).all()

@router.get("/recent", response_model = list(ListingOut))
def get_recent(limit: int = Query(30, ge=1,le =50,), db : Session = Depends(get_db)):
    return db.scalars(available_only(base_query()).limit(limit)).all()

@router.get("/{listing_id}", response_model=ListingOut)
def get_one(listing_id: str, db: Session = Depends(get_db)):
    item = db.scalar(base_query().where(Item.item_id == listing_id))
    if not item:
        raise HTTPException(404, "Listing not found")
    return item

@router.get("/brands", response_model=list[str])
def get_brands(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Item.brand)
        .where(Item.brand.is_not(None), Item.listing_status == "available")
        .distinct()
        .order_by(Item.brand)
    )
    return rows.all()

@router.get("/categories", response_model=list[str])
def get_categories(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Item.category)
        .where(Item.listing_status == "available")
        .distinct()
        .order_by(Item.category)
    )
    return rows.all()

#Post

@router.post("", response_model=ListingOut, status_code=201)
def create_listing(
    data: ListingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = Item(**data.model_dump(), user_id=user.user_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
