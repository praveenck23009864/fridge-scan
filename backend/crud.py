
from sqlalchemy.orm import Session
from models import Scan, DetectedItem
from schemas import ItemCreate, ItemUpdate


def create_scan(db: Session):
    scan = Scan(status="pending")
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def add_item(db: Session, scan_id: int, data: ItemCreate):
    scan = db.get(Scan, scan_id)
    if scan is None:
        return None

    item = DetectedItem(
        scan_id=scan_id,
        **data.model_dump()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item_id: int, data: ItemUpdate):
    item = db.get(DetectedItem, item_id)
    if item is None:
        return None

    for key, value in data.model_dump(
        exclude_unset=True
    ).items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: int):
    item = db.get(DetectedItem, item_id)
    if item is None:
        return False

    db.delete(item)
    db.commit()
    return True
