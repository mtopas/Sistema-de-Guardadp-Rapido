"""
Script de testing (no forma parte del pipeline de producción). Siembra
memory_entries "como si ya hubieran pasado por el pipeline completo" —
tipo/tags/proyecto/entidades ya asignados a mano, igual que dejaría
processor.py — para poder probar retrieval/consolidación/tags/entidades/
Explorar contra un dataset controlado.

Los embeddings SON reales (llamada real a nomic-embed-text vía Ollama, misma
jarvis.embeddings.client que usa el worker) — sin esto la búsqueda densa/
híbrida no tendría nada real que buscar.

Uso: python -m jarvis.cli.seed_test   (desde la raíz del repo, con el venv de
project/ activo — mismo intérprete que usan backend/worker/bot).
"""
import json
import uuid
from datetime import datetime, timedelta, timezone

from jarvis.config import JARVIS_DEFAULT_USER
from jarvis.db.database import get_connection, init_db
from jarvis.embeddings.client import generate_embedding
from jarvis.embeddings.store import upsert_embedding
from jarvis.entities.service import link_entities_for_entry
from jarvis.projects.service import link_project_for_entry
from jarvis.tags.service import link_tags_for_entry
from jarvis.vault.writer import write_entry

USER = JARVIS_DEFAULT_USER
SOURCE = "migration"

# Dataset diseñado a propósito para cubrir, con datos reales (no mocks):
# - catálogo de tags reusado entre varias entradas del mismo tema (jarvis/sqlite/
#   backend, jarvis/frontend/react, equipo/homelab) -- sin sinónimos sueltos.
# - un par same_fact real (sqlite_semantic / sqlite_decision): mismo hecho,
#   redactado distinto.
# - un par de contradicción real (madrid / baires): "vive en Madrid" vs
#   "se mudó a Buenos Aires".
# - un par cross-type casi-duplicado (reactquery_semantic / reactquery_decision):
#   mismo tema, clasificado en tipos distintos -- prueba la Fase D (dedup
#   cross-type).
# - una entidad (Martín Suárez) mencionada en 3 entradas de tipos distintos
#   (DECISION, SEMANTIC, PEOPLE).
# - dos términos raros/exactos (ERR-4471-XK, Quetzalcoatl-7) para probar que
#   FTS5 (búsqueda léxica) los encuentra aunque la búsqueda densa no los
#   priorice.
# - una entrada de ruido sin relación temática con nada más (cafe), para
#   confirmar que no se agrupa falsamente con ninguna otra.
ENTRIES = [
    dict(
        key="sqlite_semantic",
        type="SEMANTIC",
        content=(
            "Para Jarvis decidimos usar SQLite en vez de Postgres, por "
            "simplicidad de deploy en el homelab y porque el volumen de "
            "datos es chico."
        ),
        tags=["jarvis", "sqlite", "backend"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="sqlite_decision",
        type="DECISION",
        content=(
            "Confirmado: seguimos con SQLite para Jarvis. Postgres queda "
            "descartado por ahora, no hace falta esa complejidad."
        ),
        tags=["jarvis", "sqlite", "backend"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="madrid",
        type="RAW",
        content=(
            "Vivo en Madrid, España, hace tres años. Alquilo un "
            "departamento cerca de Atocha."
        ),
        tags=["ubicación", "personal"],
        project=None,
        entities=[],
    ),
    dict(
        key="baires",
        type="SEMANTIC",
        content=(
            "Me mudé a Buenos Aires la semana pasada. Dejé Madrid "
            "definitivamente, ya no vivo ahí."
        ),
        tags=["ubicación", "mudanza", "personal"],
        project=None,
        entities=[],
    ),
    dict(
        key="reactquery_semantic",
        type="SEMANTIC",
        content=(
            "Estamos evaluando migrar el frontend de Jarvis a usar React "
            "Query para las mutaciones, en vez del patrón optimista actual "
            "en useStore."
        ),
        tags=["jarvis", "frontend", "react"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="reactquery_decision",
        type="DECISION",
        content=(
            "Decidido: el frontend de Jarvis va a incorporar React Query "
            "para reemplazar el patrón optimista actual de useStore en las "
            "mutaciones."
        ),
        tags=["jarvis", "frontend", "react"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="martin_decision",
        type="DECISION",
        content=(
            "Martín Suárez va a liderar la migración del worker de Jarvis "
            "a Docker en el homelab."
        ),
        tags=["jarvis", "equipo", "homelab"],
        project="Jarvis",
        entities=[{"name": "Martín Suárez", "type": "person"}],
    ),
    dict(
        key="martin_semantic",
        type="SEMANTIC",
        content=(
            "Hablé con Martín Suárez sobre los tiempos del homelab, "
            "prefiere esperar a fin de mes para el rollout."
        ),
        tags=["equipo", "homelab"],
        project="Jarvis",
        entities=[{"name": "Martín Suárez", "type": "person"}],
    ),
    dict(
        key="martin_people",
        type="PEOPLE",
        content=(
            "Martín Suárez es compañero de trabajo, especialista en "
            "infraestructura Docker y Linux. Nos conocimos en el proyecto "
            "del homelab."
        ),
        tags=["equipo"],
        project=None,
        entities=[{"name": "Martín Suárez", "type": "person"}],
    ),
    dict(
        key="err_code",
        type="RAW",
        content=(
            "El error en el homelab fue el código ERR-4471-XK, aparece "
            "cuando ChromaDB pierde el archivo de índice tras un reinicio "
            "abrupto."
        ),
        tags=["homelab", "bug"],
        project="Homelab",
        entities=[],
    ),
    dict(
        key="quetzalcoatl",
        type="PROJECT",
        content=(
            "Proyecto Quetzalcoatl-7: prototipo de asistente de voz para "
            "Jarvis, actualmente en pausa por falta de tiempo."
        ),
        tags=["jarvis", "voz"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="usecallback",
        type="SEMANTIC",
        content=(
            "React usa useCallback para memoizar funciones entre renders y "
            "evitar que un componente hijo se vuelva a renderizar "
            "innecesariamente."
        ),
        tags=["react", "frontend"],
        project=None,
        entities=[],
    ),
    dict(
        key="graphiti_decision",
        type="DECISION",
        content=(
            "Decidimos posponer la integración de Graphiti hasta que haya "
            "evidencia real de que hace falta, no evaluarlo de nuevo sin "
            "una razón concreta."
        ),
        tags=["jarvis", "arquitectura"],
        project="Jarvis",
        entities=[],
    ),
    dict(
        key="cafe",
        type="RAW",
        content=(
            "Compré café en grano de Colombia, tueste medio, muy "
            "recomendable para espresso."
        ),
        tags=["personal"],
        project=None,
        entities=[],
    ),
    # Par de CONTRADICCIÓN real (2026-08-31) -- distinto de los pares
    # "same_fact" de arriba (sqlite_semantic/decision) y del que resultó ser
    # same_fact sin querer en la sesión anterior (madrid/baires, "hecho que
    # cambió con el tiempo", no contradicción por la definición del propio
    # prompt de consolidation.py). Estos dos son afirmaciones SIMULTÁNEAS e
    # incompatibles sobre el mismo tema, sin ningún lenguaje de cambio en el
    # tiempo ("ahora", "antes", "dejé", "migré"...) y con el MISMO
    # recorded_at_offset_minutes a propósito -- sin distancia temporal que le
    # sugiera al modelo "cuál reemplaza a cuál", que es justo lo que
    # distingue contradiction de same_fact según _PAIR_PROMPT.
    dict(
        key="contradiccion_remoto",
        type="RAW",
        content="Soy 100% remoto en la empresa: nunca piso la oficina para trabajar.",
        tags=["trabajo"],
        project=None,
        entities=[],
        recorded_at_offset_minutes=70,
    ),
    dict(
        key="contradiccion_oficina",
        type="RAW",
        content="Soy 100% presencial en la empresa: voy a la oficina todos los días a trabajar.",
        tags=["trabajo"],
        project=None,
        entities=[],
        recorded_at_offset_minutes=70,
    ),
    # Hueco tipo A + tipo C real (2026-09-03) -- antes solo existían "a mano"
    # en la sesión de pruebas de auditoría del 31/08 (ver Cerebro/estado-
    # actual.md), nunca en este script. "José" mencionado 2 veces sin
    # entrada PEOPLE propia: dispara el hueco tipo A (SQL puro, entity_type=
    # 'person', memory_count>=2, subject_count=0 -- ver jarvis/audit/
    # service.py::_detect_entity_gaps()) y da contenido real para que el
    # hueco tipo C (LLM, "referencia sin resolver dentro de una entrada")
    # tenga algo que encontrar si estas entradas caen en un bloque auditado
    # -- ninguno de los dos está garantizado en una corrida puntual (tipo A
    # depende de _ENTITY_CREATE_LIMIT, tipo C de qué bloque se sortea), pero
    # el dataset ahora los deja disponibles para cuando corresponda.
    dict(
        key="jose_cafe",
        type="RAW",
        content="Me fui con José a tomar un café después del trabajo, charlamos un rato largo.",
        tags=["personal"],
        project=None,
        entities=[{"name": "José", "type": "person"}],
    ),
    dict(
        key="jose_favor",
        type="RAW",
        content="José me ayudó a mover unas cajas el fin de semana, se lo debo.",
        tags=["personal"],
        project=None,
        entities=[{"name": "José", "type": "person"}],
    ),
    # Entidad de UNA sola mención (2026-09-03) -- por debajo del umbral
    # memory_count>=2 del hueco tipo A a propósito: candidata natural para el
    # nivel 1 de la pregunta abierta exploratoria (jarvis/audit/service.py::
    # _detect_single_mention_entities()/_pick_entity_candidate()), sin
    # disparar tipo A al mismo tiempo (José, arriba, sí lo dispara -- las dos
    # entidades del dataset ahora cubren ambos niveles del hueco de entidad
    # por separado, sin pisarse).
    dict(
        key="lucia_mencion",
        type="RAW",
        content="Lucía me recomendó un libro sobre historia argentina que todavía no empecé.",
        tags=["personal"],
        project=None,
        entities=[{"name": "Lucía", "type": "person"}],
    ),
]


def _insert_entry(conn, key: str, entry_type: str, content: str, tags: list[str], recorded_at: str) -> str:
    entry_id = str(uuid.uuid4())
    source_id = f"seed-test-{key}"
    with conn:
        conn.execute(
            """
            INSERT INTO memory_entries
                (id, type, content_raw, content_processed, source, channel,
                 local_only, confidential, tags,
                 recorded_at, valid_from, source_id,
                 origin_trust, user_id, created_at, created_by,
                 confidence, extraction_confidence)
            VALUES
                (?, ?, ?, ?, ?, NULL,
                 0, 0, ?,
                 ?, ?, ?,
                 'migration', ?, ?, 'explicit',
                 1.0, 0.9)
            """,
            (
                entry_id, entry_type, content, content, SOURCE,
                json.dumps(tags, ensure_ascii=False),
                recorded_at, recorded_at, source_id,
                USER, recorded_at,
            ),
        )
    return entry_id


def seed_items(items: list[dict], base_time: datetime | None = None) -> dict[str, str]:
    """Inserta + post-procesa (tags/entidades/proyecto/vault/embedding real)
    una lista de entradas con la misma forma que ENTRIES. Reusado por main()
    para el sembrado inicial completo y por llamadas puntuales para agregar
    entradas nuevas a un dataset ya sembrado sin re-insertar las que ya
    existen (ver Cerebro/decisiones-implementacion.md, 2026-08-31 -- agregar
    el par de contradicción real sin duplicar las 14 entradas originales).

    Cada item puede traer `recorded_at_offset_minutes` opcional para fijar su
    posición exacta relativa a `base_time` (default: `i * 5`, el mismo
    espaciado de siempre) -- usado por el par de contradicción para que
    ambas entradas compartan el mismo recorded_at a propósito.

    Devuelve {key: entry_id}.
    """
    base_time = base_time or (datetime.now(timezone.utc) - timedelta(hours=2))
    conn = get_connection()
    created: dict[str, str] = {}
    try:
        for i, item in enumerate(items):
            offset = item.get("recorded_at_offset_minutes", i * 5)
            recorded_at = (base_time + timedelta(minutes=offset)).isoformat()
            entry_id = _insert_entry(
                conn, item["key"], item["type"], item["content"], item["tags"], recorded_at
            )
            created[item["key"]] = entry_id
            print(f"[{item['key']}] id={entry_id} type={item['type']} recorded_at={recorded_at}")
    finally:
        conn.close()

    # Post-procesamiento fuera de la transacción de insert, mismo patrón
    # best-effort por paso que processor.py (cada paso puede fallar sin
    # tirar abajo a los demás).
    for item in items:
        entry_id = created[item["key"]]
        entry_dict = {
            "id": entry_id,
            "type": item["type"],
            "content_raw": item["content"],
            "content_processed": item["content"],
            "source": SOURCE,
            "channel": None,
            "recorded_at": "",
            "origin_trust": "migration",
            "tags": json.dumps(item["tags"], ensure_ascii=False),
        }

        link_tags_for_entry(entry_id, item["tags"], USER)

        if item["entities"]:
            link_entities_for_entry(entry_id, item["entities"], item["type"], USER)

        if item["project"]:
            link_project_for_entry(entry_id, item["project"])

        vault_rel_path = write_entry(entry_dict, title=item["content"][:60])

        embedding = generate_embedding(item["content"])
        upsert_embedding(
            entry_id,
            embedding,
            document=item["content"],
            metadata={
                "type": item["type"],
                "source": SOURCE,
                "origin_trust": "migration",
                "local_only": False,
                "confidential": False,
                "vault_path": vault_rel_path,
            },
        )

        now = datetime.now(timezone.utc).isoformat()
        conn2 = get_connection()
        try:
            with conn2:
                conn2.execute(
                    "UPDATE memory_entries SET vault_path = ?, processed_at = ?, embedded_at = ? WHERE id = ?",
                    (vault_rel_path, now, now, entry_id),
                )
                conn2.execute(
                    "INSERT INTO inbox_queue (entry_id, status, updated_at) VALUES (?, 'DONE', ?)",
                    (entry_id, now),
                )
        finally:
            conn2.close()

        print(f"[{item['key']}] processed: vault={vault_rel_path}")

    return created


def seed_empty_entry() -> str:
    """Entrada con contenido vacío/en blanco, insertada directo por SQL --
    sin pasar por seed_items() (sin embedding, sin vault, sin inbox_queue) a
    propósito: no hay contenido real que embeder, y el disparador de
    'delete' en jarvis/audit/service.py::_process_block() es puramente de
    contenido (no depende de que la entrada tenga embedding) -- mismo
    criterio "a mano" que ya se usó en la sesión de pruebas de auditoría del
    2026-08-31 (ver Cerebro/estado-actual.md), ahora parte del script en vez
    de un insert suelto que no queda documentado en ningún lado.

    Devuelve el entry_id.
    """
    entry_id = str(uuid.uuid4())
    recorded_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    conn = get_connection()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO memory_entries
                    (id, type, content_raw, content_processed, source, channel,
                     local_only, confidential, tags,
                     recorded_at, valid_from, source_id,
                     origin_trust, user_id, created_at, created_by,
                     confidence, extraction_confidence)
                VALUES
                    (?, 'RAW', '', '', ?, NULL,
                     0, 0, '[]',
                     ?, ?, ?,
                     'migration', ?, ?, 'explicit',
                     1.0, 0.9)
                """,
                (
                    entry_id, SOURCE,
                    recorded_at, recorded_at, "seed-test-entrada_vacia",
                    USER, recorded_at,
                ),
            )
    finally:
        conn.close()
    print(f"[entrada_vacia] id={entry_id} type=RAW recorded_at={recorded_at} (sin embedding/vault a propósito)")
    return entry_id


def main() -> None:
    init_db()
    created = seed_items(ENTRIES)
    empty_id = seed_empty_entry()
    created["entrada_vacia"] = empty_id
    print(f"\nSEED DONE — {len(ENTRIES)} entries + 1 entrada vacía")
    for k, v in created.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
