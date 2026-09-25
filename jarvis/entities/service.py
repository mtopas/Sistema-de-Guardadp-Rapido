"""
Extracción y vinculación de entidades — memoria PEOPLE (Jarvis 0.2, Slice 3).

Detecta personas/organizaciones mencionadas en una captura usando el modelo
local (nunca el externo — es extracción barata, no razonamiento) y las
vincula en memory_entry_entities. Llamado desde jarvis/worker/processor.py
después de clasificar cada entrada; best-effort — nunca debe hacer fallar el
procesamiento de la entrada (extract_entities y link_entities_for_entry
atrapan cualquier excepción y devuelven/no hacen nada en su lugar).
"""
import json
import logging
import uuid
from datetime import datetime, timezone

from jarvis.config import JARVIS_DEFAULT_USER, JARVIS_LOCAL_MODEL
from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

_ENTITY_PROMPT = """\
Extraé las personas y organizaciones mencionadas explícitamente en este texto.
Responde SOLO con JSON válido: un array de objetos, vacío si no hay ninguna.
Formato: [{{"name": "...", "type": "person"|"organization"}}]

Texto: {content}

JSON:"""

_MIN_ENTITY_NAME_LEN = 2


def extract_entities(content: str) -> list[dict]:
    """Extrae entidades del texto con el modelo local. Nunca lanza — [] si falla."""
    from jarvis.llm.client import call_llm

    try:
        raw = call_llm(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extraés personas y organizaciones mencionadas en texto. "
                        "Respondé únicamente con JSON válido."
                    ),
                },
                {"role": "user", "content": _ENTITY_PROMPT.format(content=content)},
            ],
            model=JARVIS_LOCAL_MODEL,
            temperature=0.0,
        )
        start, end = raw.find("["), raw.rfind("]") + 1
        if start < 0 or end <= start:
            return []
        parsed = json.loads(raw[start:end])
        if not isinstance(parsed, list):
            return []

        entities = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or "").strip()
            etype = item.get("type")
            if name and etype in ("person", "organization"):
                entities.append({"name": name, "type": etype})
        return entities
    except Exception as exc:
        logger.warning("[jarvis.entities] Extracción falló, sin entidades: %s", exc)
        return []


def link_entities_for_entry(
    entry_id: str,
    entities: list[dict],
    entry_type: str,
    user_id: str = JARVIS_DEFAULT_USER,
) -> None:
    """Vincula entidades ya extraídas a una entrada (crea o actualiza cada una).

    Si la entrada se clasificó como PEOPLE, la primera persona detectada se
    vincula con relation='subject' (la entrada es sobre ella); el resto de
    entidades (y todas las de entradas que no son PEOPLE) quedan 'mentioned'.
    Nunca lanza.
    """
    if not entities:
        return
    try:
        now = datetime.now(timezone.utc).isoformat()
        for i, ent in enumerate(entities):
            entity_id = _find_or_create_entity(ent["name"], ent["type"], user_id, now)
            relation = (
                "subject"
                if entry_type == "PEOPLE" and ent["type"] == "person" and i == 0
                else "mentioned"
            )
            _link_entry_entity(entry_id, entity_id, relation)
    except Exception as exc:
        logger.warning(
            "[jarvis.entities] Vinculación falló para entry_id=%s: %s", entry_id, exc
        )


def _find_or_create_entity(name: str, entity_type: str, user_id: str, now: str) -> str:
    """Encuentra la entidad para `name`, fusionándola por alias cuando el match
    es inequívoco, o crea una nueva.

    Resuelve el gap documentado en Cerebro/como-explotar-jarvis.md §0: antes
    de este fix, "Martín" y "Martín López" quedaban siempre como dos
    entidades separadas (match exacto contra `name` únicamente, `aliases`
    nunca se poblaba). Ahora:
      1. Match exacto (case-insensitive) contra el nombre canónico O un
         alias ya guardado.
      2. Si no hay match exacto: fusión conservadora por prefijo de tokens
         (`_is_unambiguous_alias_match`) — "Martín" fusiona con "Martín
         López" porque comparten el primer token, en cualquier orden
         temporal de llegada. Solo se fusiona si hay UN único candidato:
         con "Martín López" y "Martín Rodríguez" ya existentes, una mención
         nueva de "Martín" NO se fusiona con ninguno (ambiguo, no hay forma
         de adivinar cuál) — se crea una entidad nueva en su lugar.
      3. Deliberadamente NO se hace containment libre: "el Martín del
         trabajo" no matchea "Martín" porque el primer token no coincide
         ("el" vs "martín") — evita fusionar personas distintas que
         comparten nombre de pila, el caso borde que motivó este fix.
    El nombre canónico existente nunca se reemplaza (solo se le agregan
    alias) — evita reescribir referencias ya mostradas al usuario.
    """
    conn = get_connection()
    try:
        with conn:
            rows = conn.execute(
                """SELECT entity_id, name, aliases FROM memory_entities
                   WHERE user_id = ? AND entity_type = ?""",
                (user_id, entity_type),
            ).fetchall()

            for r in rows:
                if r["name"].lower() == name.lower() or _has_alias(r["aliases"], name):
                    conn.execute(
                        "UPDATE memory_entities SET last_seen = ? WHERE entity_id = ?",
                        (now, r["entity_id"]),
                    )
                    return r["entity_id"]

            candidates = [r for r in rows if _is_unambiguous_alias_match(name, r["name"])]
            if len(candidates) == 1:
                match = candidates[0]
                _add_alias(conn, match["entity_id"], match["aliases"], name)
                conn.execute(
                    "UPDATE memory_entities SET last_seen = ? WHERE entity_id = ?",
                    (now, match["entity_id"]),
                )
                return match["entity_id"]

            entity_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO memory_entities
                    (entity_id, name, aliases, entity_type, user_id, first_seen, last_seen, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, NULL)""",
                (
                    entity_id, name, json.dumps([], ensure_ascii=False),
                    entity_type, user_id, now, now,
                ),
            )
            return entity_id
    finally:
        conn.close()


def _has_alias(aliases_json: str | None, name: str) -> bool:
    return any(a.lower() == name.lower() for a in _parse_aliases(aliases_json))


def _is_unambiguous_alias_match(name: str, existing_name: str) -> bool:
    """True si `name` y `existing_name` comparten el mismo prefijo de tokens.

    Comparación por tokens completos, no substring libre: el nombre más
    corto debe ser un prefijo exacto (token a token) del más largo. Así
    "martín" es prefijo de "martín lópez" (fusiona) pero no de "el martín
    del trabajo" (el primer token es "el", no coincide — no fusiona).
    """
    a = name.strip().lower().split()
    b = existing_name.strip().lower().split()
    if not a or not b or len(a[0]) < _MIN_ENTITY_NAME_LEN:
        return False
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return longer[: len(shorter)] == shorter


def _add_alias(conn, entity_id: str, aliases_json: str | None, new_alias: str) -> None:
    aliases = _parse_aliases(aliases_json)
    if not any(a.lower() == new_alias.lower() for a in aliases):
        aliases.append(new_alias)
        conn.execute(
            "UPDATE memory_entities SET aliases = ? WHERE entity_id = ?",
            (json.dumps(aliases, ensure_ascii=False), entity_id),
        )


def _parse_aliases(aliases_json: str | None) -> list[str]:
    try:
        return json.loads(aliases_json) if aliases_json else []
    except Exception:
        return []


def _link_entry_entity(entry_id: str, entity_id: str, relation: str) -> None:
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """INSERT INTO memory_entry_entities (entry_id, entity_id, relation)
                   VALUES (?, ?, ?)
                   ON CONFLICT (entry_id, entity_id) DO UPDATE SET relation = excluded.relation""",
                (entry_id, entity_id, relation),
            )
    finally:
        conn.close()


# ── Consulta (retriever + API) ───────────────────────────────────────────────

def match_entities_in_text(text: str, user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Entidades conocidas mencionadas en el texto (nombre o alias, substring
    case-insensitive). Devuelve [{entity_id, name, entity_type}]. Nunca lanza.
    """
    q_lower = text.lower()
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT entity_id, name, aliases, entity_type FROM memory_entities WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    except Exception as exc:
        logger.warning("[jarvis.entities] match_entities_in_text falló: %s", exc)
        return []
    finally:
        conn.close()

    matched = []
    for r in rows:
        names = [r["name"]] + _parse_aliases(r["aliases"])
        if any(len(n) >= _MIN_ENTITY_NAME_LEN and n.lower() in q_lower for n in names):
            matched.append(
                {"entity_id": r["entity_id"], "name": r["name"], "entity_type": r["entity_type"]}
            )
    return matched


def get_entity_entry_ids(entity_ids: list[str], user_id: str = JARVIS_DEFAULT_USER) -> set:
    """entry_ids vigentes (valid_to IS NULL) vinculados a alguna de estas entidades."""
    if not entity_ids:
        return set()
    placeholders = ",".join("?" * len(entity_ids))
    conn = get_connection()
    try:
        rows = conn.execute(
            f"""SELECT DISTINCT mee.entry_id FROM memory_entry_entities mee
                JOIN memory_entries me ON me.id = mee.entry_id
                WHERE mee.entity_id IN ({placeholders}) AND me.user_id = ?
                  AND me.valid_to IS NULL""",
            entity_ids + [user_id],
        ).fetchall()
        return {r["entry_id"] for r in rows}
    finally:
        conn.close()


def list_entities(user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Entidades con notes, memory_count y types (Fase B3).

    memory_count/types se calculan solo sobre entradas vigentes (valid_to IS NULL).
    Firma de la respuesta no rompe consumidores viejos — son campos agregados, no
    reemplazos de los existentes.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT e.entity_id, e.name, e.entity_type, e.last_seen, e.notes,
                      COUNT(DISTINCT me.id) AS memory_count,
                      GROUP_CONCAT(DISTINCT me.type) AS types_csv
               FROM memory_entities e
               LEFT JOIN memory_entry_entities mee ON mee.entity_id = e.entity_id
               LEFT JOIN memory_entries me ON me.id = mee.entry_id AND me.valid_to IS NULL
               WHERE e.user_id = ?
               GROUP BY e.entity_id
               ORDER BY e.last_seen DESC""",
            (user_id,),
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            types_csv = d.pop("types_csv", None)
            d["types"] = sorted({t for t in (types_csv or "").split(",") if t})
            result.append(d)
        return result
    finally:
        conn.close()


def get_entries_for_entity(name: str, user_id: str = JARVIS_DEFAULT_USER) -> list[dict]:
    """Entradas vigentes vinculadas a una entidad, buscada por nombre o alias
    (case-insensitive). [] si no se encuentra ninguna entidad con ese nombre.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT entity_id, aliases FROM memory_entities
               WHERE user_id = ? AND LOWER(name) = LOWER(?)""",
            (user_id, name),
        ).fetchall()
        entity_ids = [r["entity_id"] for r in rows]

        if not entity_ids:
            all_rows = conn.execute(
                "SELECT entity_id, aliases FROM memory_entities WHERE user_id = ?", (user_id,)
            ).fetchall()
            for r in all_rows:
                aliases = _parse_aliases(r["aliases"])
                if any(a.lower() == name.lower() for a in aliases):
                    entity_ids.append(r["entity_id"])

        if not entity_ids:
            return []

        placeholders = ",".join("?" * len(entity_ids))
        entry_rows = conn.execute(
            f"""SELECT me.* FROM memory_entries me
                JOIN memory_entry_entities mee ON mee.entry_id = me.id
                WHERE mee.entity_id IN ({placeholders}) AND me.user_id = ?
                  AND me.valid_to IS NULL
                ORDER BY me.recorded_at DESC""",
            entity_ids + [user_id],
        ).fetchall()
        return [dict(r) for r in entry_rows]
    finally:
        conn.close()
