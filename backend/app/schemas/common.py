import uuid
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


def new_id(prefix: str = "") -> str:
    value = uuid.uuid4().hex
    return f"{prefix}{value}" if prefix else value


class AlignCVModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SourceType(str, Enum):
    CREATED = "created"
    TEX = "tex"
    PDF = "pdf"


class DateFormat(str, Enum):
    MMM_YYYY = "MMM YYYY"
    MMMM_YYYY = "MMMM YYYY"
    MM_YYYY = "MM/YYYY"
    YYYY_MM = "YYYY-MM"
    YYYY = "YYYY"


class DatePoint(AlignCVModel):
    year: int = Field(ge=1950, le=2100)
    month: int | None = Field(default=None, ge=1, le=12)

    def sort_key(self) -> tuple[int, int]:
        return (self.year, self.month or 0)


class DateRange(AlignCVModel):
    start: DatePoint
    end: DatePoint | None = None
    present: bool = False

    @model_validator(mode="after")
    def _validate_range(self) -> "DateRange":
        if self.present and self.end is not None:
            raise ValueError("end must be null when the role is present")
        if not self.present and self.end is None:
            raise ValueError("end is required unless present is true")
        if self.end is not None and self.end.sort_key() < self.start.sort_key():
            raise ValueError("end must not be earlier than start")
        return self

    def sort_key(self) -> tuple[int, int]:
        return self.start.sort_key()
