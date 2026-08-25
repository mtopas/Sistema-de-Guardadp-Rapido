SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_entries (
    id                    TEXT PRIMARY KEY,
    type                  TEXT NOT NULL
                          CHECK (type IN ('RAW','SEMANTIC','DECISION','PROJECT')),
    content_raw           TEXT NOT NULL,
    content_processed     TEXT,
    source                TEXT NOT NULL
                          CHECK (source IN ('telegram','desktop','migration')),
    channel               TEXT,
    local_only            INTEGER NOT NULL DEFAULT 0
                          CHECK (local_only IN (0,1)),
    confidential          INTEGER NOT NULL DEFAULT 0
                          CHECK (confidential IN (0,1)),
    vault_path            TEXT,
    content_hash          TEXT,
    tags                  TEXT,
    valid_from            DATETIME,
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
    embedded_at           DATETIME
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
    id         TEXT PRIMARY KEY,
    channel    TEXT NOT NULL CHECK (channel IN ('telegram','desktop')),
    channel_id TEXT,
    started_at DATETIME NOT NULL DEFAULT (datetime('now','utc')),
    user_id    TEXT NOT NULL DEFAULT 'default'
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
"""
