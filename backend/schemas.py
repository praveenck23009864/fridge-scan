from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, ConfigDict, StringConstraints, model_validator

FoodName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
StockStatus = Literal['low', 'available', 'unknown']

Category = Literal['Vegetables','Fruits','Dairy','Meat & Seafood','Beverages','Grains','Condiments','Other']


class ShoppingListCreate(BaseModel):
    name: FoodName


class ShoppingItemCreate(BaseModel):
    category: Category = "Other"
    name: FoodName
    quantity: int = Field(default=1, ge=1)


class NonNullUpdate(BaseModel):
    @model_validator(mode='before')
    @classmethod
    def reject_nulls(cls, values):
        if isinstance(values, dict) and any(value is None for value in values.values()):
            raise ValueError('Update fields cannot be null')
        return values


class ShoppingItemUpdate(NonNullUpdate):
    category: Category | None = None
    name: FoodName | None = None
    quantity: int | None = Field(default=None, ge=1)
    completed: bool | None = None


class ShoppingItemResponse(BaseModel):
    category: Category = "Other"
    id: int
    shopping_list_id: int
    name: str
    quantity: int
    completed: bool
    model_config = ConfigDict(from_attributes=True)


class ShoppingListResponse(BaseModel):
    id: int
    name: str
    source_scan_id: int | None = None
    is_mock: bool = False
    items: list[ShoppingItemResponse]
    model_config = ConfigDict(from_attributes=True)


class FoodItemFields(BaseModel):
    category: Category = "Other"
    name: FoodName
    stock_status: StockStatus = 'unknown'


class ItemCreate(FoodItemFields):
    confirmed: bool = False


class ItemUpdate(NonNullUpdate):
    category: Category | None = None
    name: FoodName | None = None
    stock_status: StockStatus | None = None
    confirmed: bool | None = None


class ItemResponse(ItemCreate):
    id: int
    scan_id: int
    model_config = ConfigDict(from_attributes=True)


class ScanCreate(BaseModel):
    is_mock: bool = False
    model_used: str | None = Field(default=None, max_length=200)


class ScanResponse(ScanCreate):
    id: int
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ReviewedItem(FoodItemFields):
    id: int | None = Field(default=None, gt=0)
    confirmed: Literal[True]


class ReviewSave(BaseModel):
    # Complete confirmed snapshot; omissions are removed in the same transaction.
    items: list[ReviewedItem] = Field(max_length=200)

    @model_validator(mode='after')
    def unique_ids(self):
        ids = [item.id for item in self.items if item.id is not None]
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate item IDs in review')
        return self

class FridgeSuggestion(BaseModel):
    id: int
    name: str
    stock_status: Literal['low'] = 'low'


class FridgeSuggestionsResponse(BaseModel):
    scan_id: int | None = None
    is_mock: bool = False
    items: list[FridgeSuggestion] = Field(default_factory=list)


class AddFridgeSuggestions(BaseModel):
    scan_id: int = Field(gt=0, strict=True)
    item_ids: list[Annotated[int, Field(gt=0, strict=True)]] = Field(min_length=1, max_length=200)

class BulkShoppingItems(BaseModel):
    items: list[ShoppingItemCreate] = Field(min_length=1, max_length=200)
