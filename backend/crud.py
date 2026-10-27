"""Database operations for scans, reviewed snapshots, and shopping lists."""
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Scan, DetectedItem, ShoppingList, ShoppingListItem
from schemas import ItemCreate, ItemUpdate, ScanCreate, ReviewSave


def create_scan(db: Session, data: ScanCreate | None = None) -> Scan:
    data = data or ScanCreate()
    scan = Scan(status='pending', is_mock=data.is_mock, model_used=data.model_used)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def add_item(db: Session, scan_id: int, data: ItemCreate) -> DetectedItem | None:
    if db.get(Scan, scan_id) is None:
        return None
    item = DetectedItem(scan_id=scan_id, **data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_item(db: Session, item_id: int, data: ItemUpdate) -> DetectedItem | None:
    item = db.get(DetectedItem, item_id)
    if item is None:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


def delete_item(db: Session, item_id: int) -> bool:
    item = db.get(DetectedItem, item_id)
    if item is None:
        return False
    try:
        db.delete(item)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return True


def save_review(db: Session, scan_id: int, data: ReviewSave) -> list[DetectedItem] | None:
    """Insert/update/delete the entire confirmed snapshot in one transaction."""
    try:
        # Validate before changing stored rows, including for direct Python callers
        # that may have mutated an already constructed schema instance.
        data = ReviewSave.model_validate(data.model_dump())
        scan = db.get(Scan, scan_id)
        if scan is None:
            return None
        existing = {
            item.id: item
            for item in db.query(DetectedItem).filter_by(scan_id=scan_id).all()
        }
        requested_ids = {item.id for item in data.items if item.id is not None}
        if not requested_ids.issubset(existing):
            raise ValueError(
                'A reviewed item no longer belongs to this scan. Reload the saved scan.'
            )

        result: list[DetectedItem] = []
        for incoming in data.items:
            if incoming.id is None:
                item = DetectedItem(
                    scan_id=scan_id, name=incoming.name,
                    stock_status=incoming.stock_status, confirmed=True,
                )
                db.add(item)
            else:
                item = existing[incoming.id]
                item.name = incoming.name
                item.stock_status = incoming.stock_status
                item.confirmed = True
            result.append(item)
        for item_id, item in existing.items():
            if item_id not in requested_ids:
                db.delete(item)
        scan.status = 'reviewed'
        db.commit()
        # The UI uses input order to attach database IDs to newly saved drafts.
        return result
    except Exception:
        db.rollback()
        raise


def scan_to_shopping_list(db: Session, scan_id: int) -> ShoppingList | None:
    try:
        scan = db.get(Scan, scan_id)
        if scan is None:
            return None
        existing = db.query(ShoppingList).filter_by(source_scan_id=scan_id).first()
        if existing is not None:
            return existing
        low_items = (
            db.query(DetectedItem)
            .filter_by(scan_id=scan_id, confirmed=True, stock_status='low')
            .order_by(DetectedItem.id)
            .all()
        )
        names: dict[str, str] = {}
        for item in low_items:
            name = ' '.join(item.name.split())
            if name:
                names.setdefault(name.casefold(), name)
        if not names:
            raise ValueError(
                'Confirm and save at least one low-stock item before creating a shopping list.'
            )
        prefix = 'DEMO - ' if scan.is_mock else ''
        shopping_list = ShoppingList(
            name=f'{prefix}Fridge scan #{scan_id}', source_scan_id=scan_id
        )
        shopping_list.items = [
            ShoppingListItem(name=name, quantity=1, completed=False)
            for name in names.values()
        ]
        db.add(shopping_list)
        db.commit()
        return shopping_list
    except IntegrityError:
        db.rollback()
        # The source_scan_id unique constraint resolves concurrent conversions.
        # Do not overwrite the winning list or hide unrelated integrity failures.
        try:
            existing = db.query(ShoppingList).filter_by(source_scan_id=scan_id).first()
        except Exception:
            db.rollback()
            raise
        if existing is not None:
            return existing
        raise
    except Exception:
        db.rollback()
        raise
