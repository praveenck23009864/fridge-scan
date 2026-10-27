
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Scan, DetectedItem
from schemas import ItemCreate, ItemUpdate, ItemResponse
import models
import crud

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI first
app = FastAPI(
    title="Fridge Scan API",
    version="1.0.0"
)

# Configure frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
        "ai": "OpenRouter integration pending"
    }


# Create fridge scan
@app.post("/api/scans", status_code=201)
def create_scan(db: Session = Depends(get_db)):
    scan = crud.create_scan(db)
    return {
        "id": scan.id,
        "status": scan.status
    }


# Get all scans
@app.get("/api/scans")
def list_scans(db: Session = Depends(get_db)):
    return db.query(Scan).order_by(
        Scan.id.desc()
    ).all()


# Get detected items for a scan
@app.get("/api/scans/{scan_id}/items")
def list_items(
    scan_id: int,
    db: Session = Depends(get_db)
):
    if db.get(Scan, scan_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Scan not found"
        )

    return db.query(DetectedItem).filter(
        DetectedItem.scan_id == scan_id
    ).all()


# Add an item to a scan
@app.post(
    "/api/scans/{scan_id}/items",
    response_model=ItemResponse,
    status_code=201
)
def add_item(
    scan_id: int,
    data: ItemCreate,
    db: Session = Depends(get_db)
):
    item = crud.add_item(db, scan_id, data)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Scan not found"
        )

    return item


# Update detected item
@app.patch(
    "/api/items/{item_id}",
    response_model=ItemResponse
)
def update_item(
    item_id: int,
    data: ItemUpdate,
    db: Session = Depends(get_db)
):
    item = crud.update_item(db, item_id, data)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Item not found"
        )

    return item


# Delete detected item
@app.delete("/api/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db)
):
    if not crud.delete_item(db, item_id):
        raise HTTPException(
            status_code=404,
            detail="Item not found"
        )

    return {"message": "Item deleted"}
