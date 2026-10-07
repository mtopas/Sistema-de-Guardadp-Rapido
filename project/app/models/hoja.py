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
    color: Optional[str] = None


class HojaPatch(BaseModel):
    apuntes:     Optional[str] = None
    icono:       Optional[str] = None
    color:       Optional[str] = None
    contenido:   Optional[str] = None
    categoria_id: Optional[int] = None
    tipo:        Optional[str] = None
    tags:        Optional[list[str]] = None


class TituloIARequest(BaseModel):
    """Refinamiento del título por IA (POST /hojas/{id}/titulo-ia).

    `titulo_provisional`: el título con el que se creó la hoja. El refinamiento
    solo reemplaza el título si el actual sigue siendo EXACTAMENTE este valor
    (no pisa una edición manual). Si no se pasa, el backend lo recalcula del
    cuerpo. `respuesta`: dato extra que dio el usuario cuando la IA pidió una
    aclaración (flujo del bot) -- se suma al cuerpo para generar el título."""
    titulo_provisional: Optional[str] = None
    respuesta: Optional[str] = None
