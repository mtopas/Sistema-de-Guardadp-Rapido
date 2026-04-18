from typing import Optional

from pydantic import BaseModel


class CategoriaCreate(BaseModel):
    nombre: str
    padre_id: Optional[int] = None
    icono: Optional[str] = None
