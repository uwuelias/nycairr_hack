from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import Item, User
from routers.listings import base_query
from schemas import ListingOut
from core.security import get_current_user

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me/listings", response_model=list[ListingOut])
def my_listings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = base_query().where(Item.user_id == user.user_id)
    return db.scalars(query).all()