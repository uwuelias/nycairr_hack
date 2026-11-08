from pydantic import BaseModel, ConfigDict


class ModelLabelReading(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label_visible: bool
    legible: bool
    model_text: str | None = None
    note: str | None = None