
from pydantic import BaseModel, Field, ConfigDict

class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    stock_status: str = "unknown"
    confirmed: bool = False

class ItemUpdate(BaseModel):
    name: str | None = None
    stock_status: str | None = None
    confirmed: bool | None = None

class ItemResponse(ItemCreate):
    id: int
    scan_id: int

    model_config = ConfigDict(from_attributes=True)
