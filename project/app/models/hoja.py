from typing import Literal, Optional

from pydantic import BaseModel


class HojaCreate(BaseModel):
    contenido: str
    categoria_id: int
    tipo: Literal["texto", "link", "foto"] = "texto"
    apuntes: Optional[str] = None
    lugar: Optional[str] = None
    latitud: Optional[float] = None
    longitud: Optional[float] = None
    fecha_recordatorio: Optional[str] = None
    icono: Optional[str] = None


class HojaPatch(BaseModel):
    apuntes: Optional[str] = None
    icono:   Optional[str] = None
