from typing import Optional

from pydantic import BaseModel


class CategoriaCreate(BaseModel):
    nombre: str
    padre_id: Optional[int] = None
    icono: Optional[str] = None
    color: Optional[str] = None

class CategoriaPatch(BaseModel):
    nombre:   Optional[str] = None
    padre_id: Optional[int] = None
    icono:    Optional[str] = None
    color:    Optional[str] = None
