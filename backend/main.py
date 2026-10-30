import logging
from typing import Annotated, Literal
from fastapi import File, Form, UploadFile

from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from recipe_service import generate_recipes, RecipeServiceError
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from database import get_db, initialize_database
from models import Scan, DetectedItem
from schemas import (
    ItemCreate,
    ItemUpdate,
    ItemResponse,
    ScanCreate,
    ScanResponse,
    ReviewSave,
)
import crud
from vision_service import (
    recognize_images,
    mock_vision_enabled,
    VisionError,
    MAX_IMAGE_BYTES,
)
from sqlalchemy.orm import selectinload
from models import ShoppingList, ShoppingListItem
from schemas import (
    FridgeSuggestionsResponse,
    AddFridgeSuggestions,
    ShoppingListCreate,
    ShoppingItemCreate,
    ShoppingItemUpdate,
    ShoppingItemResponse,
    ShoppingListResponse,
)

logging.basicConfig(level=logging.INFO)

# Create database tables
initialize_database()

# Initialize FastAPI first
app = FastAPI(title="Fridge Scan API", version="1.0.0")


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(request, exc):
    # SQLAlchemy exception text can contain user data or connection secrets.
    logging.getLogger(__name__).error(
        "database_operation_failed type=%s", type(exc).__name__
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Could not save or load data. Please retry; your review is still on screen."
        },
    )


# Configure frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Fridge Scan API running"}


@app.get("/api/health")
def health():
    return {
        "status": "success",
        "database": "SQLite connected",
        "ai": (
            "Development mock (no GroqCloud calls)"
            if mock_vision_enabled()
            else "GroqCloud configured (availability checked during analysis)"
        ),
        "mock_vision": mock_vision_enabled(),
    }


# Create fridge scan
@app.post("/api/scans", status_code=201, response_model=ScanResponse)
def create_scan(data: ScanCreate | None = None, db: Session = Depends(get_db)):
    return crud.create_scan(db, data)


# Get all scans
@app.get("/api/scans", response_model=list[ScanResponse])
def list_scans(db: Session = Depends(get_db)):
    return db.query(Scan).order_by(Scan.id.desc()).all()


# Get detected items for a scan
@app.get("/api/scans/{scan_id}/items", response_model=list[ItemResponse])
def list_items(scan_id: int, db: Session = Depends(get_db)):
    if db.get(Scan, scan_id) is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    return (
        db.query(DetectedItem)
        .filter(DetectedItem.scan_id == scan_id)
        .order_by(DetectedItem.id)
        .all()
    )


# Add an item to a scan
@app.post("/api/scans/{scan_id}/items", response_model=ItemResponse, status_code=201)
def add_item(scan_id: int, data: ItemCreate, db: Session = Depends(get_db)):
    item = crud.add_item(db, scan_id, data)

    if item is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    return item


# Update detected item
@app.patch("/api/items/{item_id}", response_model=ItemResponse)
def update_item(item_id: int, data: ItemUpdate, db: Session = Depends(get_db)):
    item = crud.update_item(db, item_id, data)

    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    return item


# Delete detected item
@app.delete("/api/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    if not crud.delete_item(db, item_id):
        raise HTTPException(status_code=404, detail="Item not found")

    return {"message": "Item deleted"}


@app.put("/api/scans/{scan_id}/review", response_model=list[ItemResponse])
def save_scan_review(scan_id: int, data: ReviewSave, db: Session = Depends(get_db)):
    try:
        items = crud.save_review(db, scan_id, data)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if items is None:
        raise HTTPException(404, "Scan not found")
    return items


@app.post("/api/scans/{scan_id}/save-to-list", response_model=ShoppingListResponse)
def save_scan_to_list(scan_id: int, db: Session = Depends(get_db)):
    try:
        shopping_list = crud.scanto_shopping_list(db, scan_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if shopping_list is None:
        raise HTTPException(404, "Scan not found")
    return shopping_list


# CREATE SHOPPING LIST
@app.post("/api/shopping-lists", response_model=ShoppingListResponse, status_code=201)
def create_shopping_list(data: ShoppingListCreate, db: Session = Depends(get_db)):
    shopping_list = ShoppingList(name=data.name)
    db.add(shopping_list)
    db.commit()
    db.refresh(shopping_list)
    return shopping_list


# READ ALL SHOPPING LISTS
@app.get("/api/shopping-lists", response_model=list[ShoppingListResponse])
def get_shopping_lists(db: Session = Depends(get_db)):
    return (
        db.query(ShoppingList)
        .options(selectinload(ShoppingList.items))
        .order_by(ShoppingList.id.desc())
        .all()
    )


# READ ONE SHOPPING LIST
@app.get("/api/shopping-lists/{list_id}", response_model=ShoppingListResponse)
def get_shopping_list(list_id: int, db: Session = Depends(get_db)):
    shopping_list = db.get(ShoppingList, list_id)

    if not shopping_list:
        raise HTTPException(404, "Shopping list not found")

    return shopping_list


# UPDATE SHOPPING LIST NAME
@app.patch("/api/shopping-lists/{list_id}", response_model=ShoppingListResponse)
def rename_shopping_list(
    list_id: int, data: ShoppingListCreate, db: Session = Depends(get_db)
):
    shopping_list = db.get(ShoppingList, list_id)

    if not shopping_list:
        raise HTTPException(404, "Shopping list not found")

    shopping_list.name = data.name
    db.commit()
    db.refresh(shopping_list)
    return shopping_list


# DELETE SHOPPING LIST
@app.delete("/api/shopping-lists/{list_id}", status_code=204)
def delete_shopping_list(list_id: int, db: Session = Depends(get_db)):
    shopping_list = db.get(ShoppingList, list_id)

    if not shopping_list:
        raise HTTPException(404, "Shopping list not found")

    db.delete(shopping_list)
    db.commit()
    return None


# ADD ITEM TO SHOPPING LIST
@app.post(
    "/api/shopping-lists/{list_id}/items",
    response_model=ShoppingItemResponse,
    status_code=201,
)
def add_shopping_item(
    list_id: int, data: ShoppingItemCreate, db: Session = Depends(get_db)
):
    shopping_list = db.get(ShoppingList, list_id)

    if not shopping_list:
        raise HTTPException(404, "Shopping list not found")

    item = ShoppingListItem(
        shopping_list_id=list_id,
        name=data.name,
        quantity=data.quantity,
        category=data.category,
        completed=False,
    )

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# UPDATE SHOPPING ITEM
@app.patch("/api/shopping-list-items/{item_id}", response_model=ShoppingItemResponse)
def update_shopping_item(
    item_id: int, data: ShoppingItemUpdate, db: Session = Depends(get_db)
):
    item = db.get(ShoppingListItem, item_id)

    if not item:
        raise HTTPException(404, "Shopping item not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


# DELETE SHOPPING ITEM
@app.delete("/api/shopping-list-items/{item_id}", status_code=204)
def delete_shopping_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(ShoppingListItem, item_id)

    if not item:
        raise HTTPException(404, "Shopping item not found")

    db.delete(item)
    db.commit()
    return None


@app.post("/api/scans/analyze")
async def analyze_fridge(
    photos: Annotated[
        list[UploadFile], File(description="Upload 1 to 3 fridge photos")
    ],
    consent: Annotated[bool, Form()] = False,
):
    try:
        # User must approve photo processing
        if not consent:
            raise HTTPException(status_code=400, detail="Photo processing consent required")

        # Accept 1 to 3 fridge photos
        if not 1 <= len(photos) <= 3:
            raise HTTPException(status_code=422, detail="Upload between 1 and 3 photos")

        image_bytes = []

        for photo in photos:
            if photo.content_type not in ["image/jpeg", "image/png", "image/webp"]:
                raise HTTPException(status_code=415, detail="Unsupported image format")

            # Limit each photo to 5 MB
            raw = await photo.read(MAX_IMAGE_BYTES + 1)

            if len(raw) > MAX_IMAGE_BYTES:
                raise HTTPException(status_code=413, detail="Photo must be at most 5 MB")

            image_bytes.append(raw)

        try:
            result = await recognize_images(image_bytes)
        except VisionError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

        if not result["items"]:
            raise HTTPException(
                status_code=422, detail="No food items detected. Try another photo."
            )

        return result
    finally:
        # Close every multipart spool, including validation failures and cancellation.
        for photo in photos:
            await photo.close()



def recipe_inventory(db: Session) -> dict:
    scan = db.query(Scan).filter_by(status="reviewed").order_by(Scan.created_at.desc(), Scan.id.desc()).first()
    snapshot = {"scan_id": scan.id if scan else None, "available": [], "low": [], "unknown": []}
    if scan:
        for item in db.query(DetectedItem).filter_by(scan_id=scan.id, confirmed=True).all():
            status = item.stock_status if item.stock_status in ("available", "low") else "unknown"
            if item.name.strip() and item.name not in snapshot[status]:
                snapshot[status].append(item.name)
    return snapshot


@app.get("/api/recipes/inventory")
def get_recipe_inventory(db: Session = Depends(get_db)):
    return recipe_inventory(db)


class RecipeGenerateRequest(BaseModel):
    scan_id: int | None = Field(default=None, gt=0)
    mode: Literal["have", "almost"] = "have"
    servings: int = Field(default=2, ge=1, le=12)
    dietary_preferences: str = Field(default="", max_length=300)
    max_time: int | None = Field(default=None, ge=1, le=600)
    cuisine: Literal["Any", "Indian", "South Indian", "Chinese", "Italian", "Mexican", "Thai", "american"] = "Any"
    spice_level: Literal["Mild", "Medium", "Spicy"] = "Medium"
    excluded_ingredients: str = Field(default="", max_length=300)


@app.post("/api/recipes/generate")
async def generate_recipe_suggestions(
    data: RecipeGenerateRequest,
    db: Session = Depends(get_db),
):
    if data.scan_id is not None and db.get(Scan, data.scan_id) is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    snapshot = recipe_inventory(db)
    ingredients = snapshot["available"]

    if not ingredients:
        raise HTTPException(
            status_code=422,
            detail="Confirm fridge ingredients first.",
        )

    try:
        result = await run_in_threadpool(
            generate_recipes,
            ingredients,
            data.servings,
            data.dietary_preferences,
            data.max_time,
            data.cuisine,
            data.spice_level,
            data.excluded_ingredients,
            data.mode,
        )
        return {**result, "inventory": snapshot}
    except RecipeServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc


@app.get('/api/fridge-suggestions', response_model=FridgeSuggestionsResponse)
def get_fridge_suggestions(db: Session = Depends(get_db)):
    return crud.fridge_suggestions(db)


@app.post('/api/shopping-lists/{list_id}/fridge-suggestions', response_model=ShoppingListResponse)
def add_suggested_items(list_id: int, data: AddFridgeSuggestions, db: Session = Depends(get_db)):
    try:
        result = crud.add_fridge_suggestions(db, list_id, data.scan_id, data.item_ids)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if result is None:
        raise HTTPException(404, 'Shopping list not found')
    return result


from schemas import BulkShoppingItems
from sqlalchemy import text

@app.post('/api/shopping-lists/{list_id}/bulk-items', response_model=ShoppingListResponse)
def bulk_shopping_items(list_id: int, data: BulkShoppingItems, db: Session = Depends(get_db)):
    try:
        db.execute(text('BEGIN IMMEDIATE'))
        target = db.get(ShoppingList, list_id)
        if target is None:
            raise HTTPException(404, 'Shopping list not found')
        names = {crud.normalized_food_name(i.name) for i in target.items}
        for incoming in data.items:
            key = crud.normalized_food_name(incoming.name)
            if key not in names:
                db.add(ShoppingListItem(shopping_list_id=list_id, **incoming.model_dump(), completed=False))
                names.add(key)
        db.commit()
        db.expire(target, ['items'])
        return target
    except Exception:
        db.rollback()
        raise
