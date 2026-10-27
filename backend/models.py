
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, DateTime,
    Boolean, ForeignKey
)
from sqlalchemy.orm import relationship

from database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), default=utc_now)

    items = relationship(
        "DetectedItem",
        back_populates="scan",
        cascade="all, delete-orphan"
    )


class DetectedItem(Base):
    __tablename__ = "detected_items"

    id = Column(Integer, primary_key=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=False)
    name = Column(String, nullable=False)
    stock_status = Column(String, default="unknown")
    confirmed = Column(Boolean, default=False)

    scan = relationship("Scan", back_populates="items")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    items = relationship(
        "ShoppingListItem",
        back_populates="shopping_list",
        cascade="all, delete-orphan"
    )


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"

    id = Column(Integer, primary_key=True)
    shopping_list_id = Column(
        Integer,
        ForeignKey("shopping_lists.id"),
        nullable=False
    )
    name = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    completed = Column(Boolean, default=False)

    shopping_list = relationship(
        "ShoppingList",
        back_populates="items"
    )
