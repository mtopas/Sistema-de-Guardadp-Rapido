SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_entries (
    id                    TEXT PRIMARY KEY,
    type                  TEXT NOT NULL
                          CHECK (type IN ('RAW','SEMANTIC','DECISION','PROJECT','PEOPLE')),
    content_raw           TEXT NOT NULL,
    content_processed     TEXT,
    source                TEXT NOT NULL
                          CHECK (source IN ('telegram','desktop','migration','agenda')),
    channel               TEXT,
    local_only            INTEGER NOT NULL DEFAULT 0
                          CHECK (local_only IN (0,1)),
    confidential          INTEGER NOT NULL DEFAULT 0
                          CHECK (confidential IN (0,1)),
    vault_path            TEXT,
    content_hash          TEXT,
    tags                  TEXT,
    valid_from            DATETIME,
    valid_to              DATETIME,
    recorded_at           DATETIME NOT NULL
                          DEFAULT (datetime('now','utc')),
    source_id             TEXT NOT NULL,
    confidence            REAL NOT NULL DEFAULT 1.0
                          CHECK (confidence BETWEEN 0.0 AND 1.0),
    extraction_confidence REAL
                          CHECK (extraction_confidence IS NULL
                                 OR extraction_confidence BETWEEN 0.0 AND 1.0),
    origin_trust          TEXT NOT NULL DEFAULT 'user.authenticated'
                          CHECK (origin_trust IN (
                              'user.authenticated',
                              'telegram.user',
                              'web.untrusted',
                              'system',
                              'migration'
                          )),
    user_id               TEXT NOT NULL DEFAULT 'default',
    created_at            DATETIME NOT NULL DEFAULT (datetime('now','utc')),
    processed_at          DATETIME,
    embedded_at           DATETIME,
    -- Gobernanza de captura (0.2 Slice 4, pieza C) -- mismo vocabulario que
    -- memory_projects.created_by, deliberadamente: distingue "el usuario tipeó
    -- esto y lo guardó a propósito" de "Jarvis lo infirió de una charla casual
    -- y el usuario aceptó la propuesta". No es lo mismo que origin_trust (esa
    -- columna es sobre confiabilidad de la FUENTE del texto -- un mensaje de
    -- Telegram del usuario es 'telegram.user' se haya capturado explícito o
    -- vía propuesta pasiva; created_by es sobre CÓMO se decidió guardarlo).
    -- Ver Cerebro/decisiones-implementacion.md, pieza C.
    created_by            TEXT NOT NULL DEFAULT 'explicit'
                          CHECK (created_by IN ('explicit','jarvis_proposal_accepted')),
    -- Fusión Jarvis + Bóveda (Cerebro/decisiones-implementacion.md,
    -- 2026-09-11): eje de autoría, NO el mismo eje que created_by. created_by
    -- distingue "el usuario lo tipeó directo" vs "nació de una propuesta que
    -- aceptó" -- en ambos casos el CONTENIDO puede ser palabra del usuario
    -- (ej. clarify: la respuesta de texto libre ES lo que el usuario tipeó).
    -- authorship distingue de verdad quién escribió la PROSA final: 'user'
    -- (el usuario, sea cual sea el canal/mecanismo) vs 'jarvis_synthesis'
    -- (LLM combinando fragmentos -- hoy solo audit 'create', ver
    -- jarvis/audit/service.py::_apply_create()). Determina a qué raíz del
    -- vault escribe write_entry(): 'user' -> D:\Boveda (árbol PARA,
    -- 00 - Sin categorizar/), 'jarvis_synthesis' -> Boveda/Jarvis/.
    authorship            TEXT NOT NULL DEFAULT 'user'
                          CHECK (authorship IN ('user','jarvis_synthesis')),
    -- Auditoría proactiva de memoria (0.2 Slice 4, ver Cerebro/decisiones-
    -- implementacion.md, 2026-08-31): hasta cuándo se revisó esta entrada
    -- por última vez en una corrida de jarvis.audit.service.run_audit().
    -- Bug real encontrado 2026-09-03 implementando 0.3 (ver Cerebro/
    -- decisiones-implementacion.md): esta columna solo vivía en la
    -- migración (_add_column_if_missing en _migrate()), nunca acá en el
    -- CREATE estático -- cualquier migración de rebuild que corriera
    -- DESPUÉS de que una DB real ya tuviera la columna (como
    -- _migrate_memory_entries_source(), 0.3) reconstruía memory_entries_new
    -- a partir de _MEMORY_ENTRIES_CREATE sin esta columna, y el INSERT
    -- posterior (que sí la lista, porque lee las columnas reales de la
    -- tabla vieja) fallaba con "no column named last_audited_at". Agregada
    -- acá para que _MEMORY_ENTRIES_CREATE (jarvis/db/database.py) siempre
    -- incluya TODAS las columnas reales -- el _add_column_if_missing()
    -- correspondiente en _migrate() queda como red de seguridad para DBs
    -- viejas que todavía no la tengan (mismo patrón que created_by arriba).
    last_audited_at       DATETIME
);

CREATE INDEX IF NOT EXISTS idx_me_type   ON memory_entries(type);
CREATE INDEX IF NOT EXISTS idx_me_user   ON memory_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_me_hash   ON memory_entries(content_hash);
CREATE INDEX IF NOT EXISTS idx_me_trust  ON memory_entries(origin_trust);

CREATE TABLE IF NOT EXISTS inbox_queue (
    entry_id       TEXT PRIMARY KEY
                   REFERENCES memory_entries(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','PROCESSING','DONE','ERROR')),
    attempts       INTEGER NOT NULL DEFAULT 0,
    last_error     TEXT,
    next_retry_at  DATETIME,
    updated_at     DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_iq_status ON inbox_queue(status);
CREATE INDEX IF NOT EXISTS idx_iq_retry  ON inbox_queue(next_retry_at)
    WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS memory_projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    local_only  INTEGER NOT NULL DEFAULT 0
                CHECK (local_only IN (0,1)),
    created_by  TEXT NOT NULL DEFAULT 'user'
                CHECK (created_by IN ('user','jarvis_proposal_accepted')),
    created_at  DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE TABLE IF NOT EXISTS memory_entry_projects (
    entry_id    TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL REFERENCES memory_projects(id) ON DELETE RESTRICT,
    is_primary  INTEGER NOT NULL DEFAULT 0
                CHECK (is_primary IN (0,1)),
    assigned_by TEXT NOT NULL DEFAULT 'jarvis'
                CHECK (assigned_by IN ('user','jarvis')),
    PRIMARY KEY (entry_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_mep_project ON memory_entry_projects(project_id);

CREATE TABLE IF NOT EXISTS conversations (
    id                     TEXT PRIMARY KEY,
    channel                TEXT NOT NULL CHECK (channel IN ('telegram','desktop')),
    channel_id             TEXT,
    title                  TEXT,
    started_at             DATETIME NOT NULL DEFAULT (datetime('now','utc')),
    user_id                TEXT NOT NULL DEFAULT 'default',
    -- Captura pasiva por inactividad (pieza C): marca hasta qué punto ya se
    -- evaluó esta conversación para proponer una captura, para no re-escanear
    -- los mismos mensajes en cada vuelta del worker.
    last_passive_review_at DATETIME
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content         TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_cm_conv ON conversation_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS budget_usage (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT NOT NULL,
    model            TEXT NOT NULL,
    tokens_in        INTEGER NOT NULL DEFAULT 0,
    tokens_out       INTEGER NOT NULL DEFAULT 0,
    cost_usd         REAL    NOT NULL DEFAULT 0.0,
    daily_budget_usd REAL    NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_bu_date ON budget_usage(date);

-- Policy store: separado del memory store (Memoria ≠ Permiso).
-- El LLM no puede escribir aquí directamente. Solo código confiable lo hace.
CREATE TABLE IF NOT EXISTS jarvis_policies (
    id          TEXT PRIMARY KEY,
    policy_type TEXT NOT NULL,
    value       TEXT NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

-- Entidades (personas/organizaciones/lugares) detectadas en capturas (0.2 Slice 3).
CREATE TABLE IF NOT EXISTS memory_entities (
    entity_id    TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    aliases      TEXT,          -- JSON array de nombres alternativos
    entity_type  TEXT NOT NULL, -- 'person' | 'organization' | 'place'
    user_id      TEXT NOT NULL DEFAULT 'default',
    first_seen   DATETIME NOT NULL,
    last_seen    DATETIME NOT NULL,
    notes        TEXT           -- resumen libre, actualizable
);

CREATE INDEX IF NOT EXISTS idx_men_user ON memory_entities(user_id);
CREATE INDEX IF NOT EXISTS idx_men_name ON memory_entities(name);

CREATE TABLE IF NOT EXISTS memory_entry_entities (
    entry_id     TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
    entity_id    TEXT NOT NULL REFERENCES memory_entities(entity_id) ON DELETE CASCADE,
    relation     TEXT,          -- 'mentioned' | 'author' | 'subject'
    PRIMARY KEY (entry_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_mee_entity ON memory_entry_entities(entity_id);

-- Log de eventos del worker (0.2, Fase B5) — alimenta el tab Debug del frontend.
-- entry_id nullable: algunos eventos futuros podrían no estar atados a una entrada
-- puntual; hoy todos los que escribe processor.py sí lo están.
CREATE TABLE IF NOT EXISTS jarvis_event_log (
    id         TEXT PRIMARY KEY,
    entry_id   TEXT REFERENCES memory_entries(id) ON DELETE SET NULL,
    level      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT (datetime('now','utc'))
);

CREATE INDEX IF NOT EXISTS idx_jel_created ON jarvis_event_log(created_at);

-- Catálogo de tags (0.2 Slice 4, pieza A). Mismo patrón que memory_entities:
-- tabla canónica + tabla puente, dedup case-insensitive en jarvis/tags/service.py
-- (nunca UNIQUE(name) acá -- el merge conservador vive en código, igual que
-- _find_or_create_entity()).
CREATE TABLE IF NOT EXISTS memory_tags (
    tag_id     TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    user_id    TEXT NOT NULL DEFAULT 'default',
    first_seen DATETIME NOT NULL,
    last_seen  DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mt_user ON memory_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_mt_name ON memory_tags(name);

CREATE TABLE IF NOT EXISTS memory_entry_tags (
    entry_id TEXT NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES memory_tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_met_tag ON memory_entry_tags(tag_id);

-- Propuestas de captura pasiva por inactividad (0.2 Slice 4, pieza C).
-- Cola separada de inbox_queue a propósito: inbox_queue es "ya se decidió
-- guardar, falta procesar"; esta tabla es "todavía no se decidió guardar".
-- Solo entra a memory_entries/inbox_queue si el usuario acepta (capture_raw
-- normal, created_by='jarvis_proposal_accepted' -- ver esa columna abajo).
CREATE TABLE IF NOT EXISTS jarvis_capture_proposals (
    id                 TEXT PRIMARY KEY,
    conversation_id    TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    channel            TEXT NOT NULL CHECK (channel IN ('telegram','desktop')),
    channel_id         TEXT,
    content            TEXT NOT NULL,
    question           TEXT NOT NULL,
    status             TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','ACCEPTED','REJECTED','EXPIRED')),
    entry_id           TEXT REFERENCES memory_entries(id) ON DELETE SET NULL,
    user_id            TEXT NOT NULL DEFAULT 'default',
    created_at         DATETIME NOT NULL DEFAULT (datetime('now','utc')),
    resolved_at        DATETIME,
    -- Ingestión automática (0.3, Agenda de SGR -- ver Cerebro/decisiones-
    -- implementacion.md, 2026-09-03): distingue de dónde salió la propuesta.
    -- No cambia el flujo de aceptar/rechazar (mismo accept_proposal()/
    -- resolve de siempre) -- solo para mensaje/UI y para el dedup propio de
    -- jarvis/ingestion/agenda.py (origin_source_key).
    origin_source      TEXT NOT NULL DEFAULT 'passive_capture'
                       CHECK (origin_source IN ('passive_capture','agenda_ingestion')),
    -- Clave determinística ("agenda:evento:{id}:{fecha_inicio}" /
    -- "agenda:tarea:{id}") que identifica el evento/tarea de origen -- NULL
    -- para 'passive_capture'. Se chequea en jarvis/ingestion/agenda.py antes
    -- de proponer de nuevo, cualquiera sea el status ya resuelto (incluye
    -- REJECTED -- una vez que el usuario dijo que no a un evento puntual, no
    -- se le vuelve a preguntar por el mismo).
    origin_source_key TEXT,
    -- pushed_at (2026-09-17, ver Cerebro/decisiones-implementacion.md): mismo
    -- throttle anti-ráfaga que jarvis_audit_proposals (columna hermana, ver
    -- abajo), aplicado acá. NULL = todavía en la cola, sin entregar al
    -- usuario. No-NULL = ya se le mandó (Telegram) o, para canal 'desktop'
    -- (pull vía polling, sin ráfaga que evitar), se considera "entregada" de
    -- entrada (ver jarvis/captures/passive.py, _initial_pushed_at()). A
    -- diferencia de jarvis_audit_proposals, acá no hay ninguna excepción por
    -- tipo/origen: passive_capture, agenda_ingestion y los patrones de
    -- agenda_patterns.py (origin_source_key "agenda:patron:...") van todos a
    -- la MISMA cola por canal telegram. expire_stale_proposals() cuenta el
    -- timeout desde ACÁ, no desde created_at -- una propuesta que el usuario
    -- nunca vio no puede expirar.
    pushed_at         DATETIME
);

CREATE INDEX IF NOT EXISTS idx_jcp_status ON jarvis_capture_proposals(status);
CREATE INDEX IF NOT EXISTS idx_jcp_channel ON jarvis_capture_proposals(channel, channel_id);

-- Auditoría proactiva de memoria (0.2 Slice 4 -- extensión de consolidation.py,
-- ver Cerebro/decisiones-implementacion.md, 2026-08-31). Distinta de
-- jarvis_capture_proposals a propósito: captura pasiva siempre crea contenido
-- nuevo a partir de una conversación; audit actúa sobre memory_entries ya
-- existentes con 11 tipos de acción, algunos con dos entry_ids target.
-- action_type: create|clarify|flag_contradiction|flag_connection|merge|edit|
-- delete|retag|open_question|archive_superseded|triage_move. payload/
-- target_entry_ids van serializados como
-- JSON (mismo criterio que memory_entries.tags). Ninguna acción se aplica sin
-- pasar por este ciclo PENDING -> ACCEPTED/REJECTED/EXPIRED.
-- open_question (2026-09-03, ver Cerebro/decisiones-implementacion.md):
-- pregunta exploratoria sin hueco concreto detectado, disparada solo cuando
-- una corrida no tuvo nada más que reportar. Se resuelve igual que clarify
-- (la respuesta ES el contenido nuevo) -- distinta acción, mismo mecanismo de
-- resolución, para no mezclar dos disparadores conceptualmente distintos
-- bajo el mismo action_type. target_entry_ids puede ser '[]' (JSON array
-- vacío, NOT NULL sigue satisfecho) para la variante "pregunta de arranque"
-- sin ninguna entrada concreta de la que colgarla.
-- pushed_at (2026-09-17, ver Cerebro/decisiones-implementacion.md): NULL =
-- todavía en la cola de throttle, sin entregar al usuario. No-NULL = ya se
-- le mandó (Telegram) o, para canal 'desktop'/tipos agrupados/open_question,
-- se considera "entregada" de entrada (ver jarvis/audit/service.py,
-- _initial_pushed_at()). expire_stale_proposals() cuenta el timeout desde
-- ACÁ, no desde created_at -- una propuesta que el usuario nunca vio no
-- puede expirar.
CREATE TABLE IF NOT EXISTS jarvis_audit_proposals (
    id                TEXT PRIMARY KEY,
    action_type       TEXT NOT NULL
                      CHECK (action_type IN (
                          'create','clarify','flag_contradiction',
                          'flag_connection','merge','edit','delete','retag',
                          'open_question','archive_superseded','triage_move'
                      )),
    target_entry_ids  TEXT NOT NULL,
    payload           TEXT,
    question          TEXT NOT NULL,
    channel           TEXT NOT NULL CHECK (channel IN ('telegram','desktop')),
    channel_id        TEXT,
    status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN (
                          'PENDING','ACCEPTED','REJECTED','EXPIRED',
                          'RESOLVED_WITH_NEW_INFO'
                      )),
    entry_id          TEXT REFERENCES memory_entries(id) ON DELETE SET NULL,
    user_id           TEXT NOT NULL DEFAULT 'default',
    created_at        DATETIME NOT NULL DEFAULT (datetime('now','utc')),
    resolved_at       DATETIME,
    pushed_at         DATETIME
);

CREATE INDEX IF NOT EXISTS idx_jap_status ON jarvis_audit_proposals(status);
CREATE INDEX IF NOT EXISTS idx_jap_channel ON jarvis_audit_proposals(channel, channel_id);
"""
