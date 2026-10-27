"""Typed ORM mappings; column names, constraints and SQL types stay unchanged."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Scan(Base):
    __tablename__ = 'scans'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    status: Mapped[str] = mapped_column(String, default='pending', nullable=True)
    is_mock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default='0')
    model_used: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=True)

    items: Mapped[list[DetectedItem]] = relationship(
        back_populates='scan', cascade='all, delete-orphan'
    )


class DetectedItem(Base):
    __tablename__ = 'detected_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scan_id: Mapped[int] = mapped_column(Integer, ForeignKey('scans.id'), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    stock_status: Mapped[str] = mapped_column(String, default='unknown', nullable=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)

    scan: Mapped[Scan] = relationship(back_populates='items')


class ShoppingList(Base):
    __tablename__ = 'shopping_lists'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source_scan_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey('scans.id'), nullable=True, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=True)

    source_scan: Mapped[Scan | None] = relationship()
    items: Mapped[list[ShoppingListItem]] = relationship(
        back_populates='shopping_list', cascade='all, delete-orphan'
    )

    @property
    def is_mock(self) -> bool:
        return self.source_scan is not None and self.source_scan.is_mock


class ShoppingListItem(Base):
    __tablename__ = 'shopping_list_items'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shopping_list_id: Mapped[int] = mapped_column(
        Integer, ForeignKey('shopping_lists.id'), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)

    shopping_list: Mapped[ShoppingList] = relationship(back_populates='items')
