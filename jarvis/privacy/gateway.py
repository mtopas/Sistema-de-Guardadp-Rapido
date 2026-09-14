"""
Privacy Gateway (spec §17) — filtra qué memory_entries pueden salir
al modelo externo. Ante la duda, bloquea.

Orden de verificación:
  1. entry.local_only            -> bloquear
  2. entry.confidential          -> bloquear
  3. proyecto asociado local_only -> bloquear
  4. regex de secretos evidentes  -> bloquear el fragmento (no la consulta completa)
  5. detector de PII sensible     -> bloquear el fragmento (mismo criterio que 4)

Alcance del detector de PII (2026-09-03, jarvis-spec.html §29 "PII detector
completo" — ver Cerebro/decisiones-implementacion.md para el razonamiento
completo): documentos de identidad, cuentas/tarjetas financieras y contexto
de salud. Deliberadamente NO nombres de persona, teléfonos, direcciones ni
contenido personal en general -- eso es precisamente lo que el tipo PEOPLE
existe para guardar (Componentes-Evaluados.md, hallazgo #3, ya lo aclaraba:
"no se trata de bloquear... contenido personal en general"). Igual que los
secretos: bloquea el FRAGMENTO que sale al LLM externo como contexto RAG,
nunca la captura en sí -- la entrada se guarda igual en memory_entries.
"""
import logging
import re

from jarvis.db.database import get_connection

logger = logging.getLogger(__name__)

# Patrones mínimos de secretos evidentes (spec §17).
SECRET_PATTERNS = {
    "openai_key": re.compile(r"sk-[A-Za-z0-9]{20,}"),
    "github_pat": re.compile(r"ghp_[A-Za-z0-9]{36}"),
    "slack_bot_token": re.compile(r"xoxb-[0-9]+-[A-Za-z0-9-]+"),
    "bearer_token": re.compile(r"Bearer [A-Za-z0-9._~+/-]+=*"),
    "password_inline": re.compile(r"password\s*[:=]\s*\S+", re.IGNORECASE),
    "api_key_inline": re.compile(r"api_?key\s*[:=]\s*\S+", re.IGNORECASE),
}


def find_secrets(text: str) -> list[str]:
    """Devuelve los nombres de los patrones de secreto encontrados en el texto."""
    if not text:
        return []
    return [name for name, pattern in SECRET_PATTERNS.items() if pattern.search(text)]


# ── PII sensible (0.2→0.3) ───────────────────────────────────────────────────
# Documentos de identidad y cuentas financieras: patrones estructurados de
# alta confianza (formato específico, bajo riesgo de falso positivo). DNI
# plano (7-8 dígitos sueltos) NO se detecta sin contexto -- un número de 7-8
# dígitos es demasiado común (montos, fechas, teléfonos parciales) para
# marcarlo solo; se exige la palabra "DNI"/"documento" cerca.
PII_PATTERNS = {
    # CUIT/CUIL argentino: NN-NNNNNNNN-N. Formato fijo, sin ambigüedad real.
    "cuit_cuil": re.compile(r"\b\d{2}-\d{8}-\d\b"),
    # DNI con la palabra clave inmediatamente antes -- reduce falsos positivos
    # de números de 7-8 dígitos sueltos (montos, fechas, teléfonos parciales).
    "dni_con_contexto": re.compile(
        r"\b(?:dni|documento)\b[\s:.\-]{0,10}(\d{1,3}(?:[.\s]?\d{3}){1,2})\b",
        re.IGNORECASE,
    ),
    # CBU/CVU argentino: exactamente 22 dígitos consecutivos. Longitud fija
    # infrecuente fuera de este contexto -- alta confianza sin necesitar
    # palabra clave.
    "cbu_cvu": re.compile(r"\b\d{22}\b"),
}

# Palabras clave de contexto de salud -- heurística de MENOR confianza que los
# patrones estructurados de arriba (no hay formato fijo para "un diagnóstico"),
# aceptada a propósito con el mismo criterio conservador que ya rige el resto
# del gateway ("ante la duda, bloquea"): un falso positivo acá solo cuesta un
# fragmento de más bloqueado del contexto RAG, nunca un dato real filtrado.
_HEALTH_KEYWORDS = re.compile(
    r"\b("
    r"diagn[oó]stico|diagnosticad[oa]|"
    r"enfermedad|patolog[ií]a|s[ií]ndrome|"
    r"medicaci[oó]n|tratamiento m[eé]dico|"
    r"vih|hiv|"
    r"psiqui[aá]tric[oa]|psicoterap|"
    r"resultado.{0,15}(positivo|negativo)|"
    r"historia cl[ií]nica"
    r")\b",
    re.IGNORECASE,
)


# Candidatos a número de tarjeta: 13-19 dígitos, agrupados opcionalmente de a
# 4 con espacio o guión (formato real de impresión/tipeo de una tarjeta).
_CARD_CANDIDATE = re.compile(r"\b(?:\d[ -]?){13,19}\b")


def _luhn_valid(digits: str) -> bool:
    """Algoritmo de Luhn -- reduce falsos positivos de "cualquier secuencia
    larga de dígitos" a "secuencia que además pasa el checksum real que usan
    las tarjetas de pago". Sin esto, cualquier ID largo (factura, tracking)
    dispararía el detector."""
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def find_card_number(text: str) -> bool:
    """True si el texto contiene una secuencia de 13-19 dígitos que además
    pasa Luhn (número de tarjeta plausible, no cualquier ID largo)."""
    if not text:
        return False
    for match in _CARD_CANDIDATE.finditer(text):
        digits = re.sub(r"[ -]", "", match.group(0))
        if 13 <= len(digits) <= 19 and _luhn_valid(digits):
            return True
    return False


def find_pii(text: str) -> list[str]:
    """Nombres de los patrones PII estructurados (documento/cuenta) encontrados."""
    if not text:
        return []
    found = [name for name, pattern in PII_PATTERNS.items() if pattern.search(text)]
    if find_card_number(text):
        found.append("card_number")
    return found


def find_health_context(text: str) -> bool:
    """True si el texto contiene lenguaje de contexto de salud (heurística de
    palabras clave, no un dato estructurado -- ver docstring del módulo)."""
    if not text:
        return False
    return bool(_HEALTH_KEYWORDS.search(text))


def _project_local_only(entry_id: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute(
            """SELECT 1 FROM memory_entry_projects mep
               JOIN memory_projects mp ON mp.id = mep.project_id
               WHERE mep.entry_id = ? AND mp.local_only = 1
               LIMIT 1""",
            (entry_id,),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def is_entry_allowed(entry: dict) -> tuple[bool, str | None]:
    """Aplica el orden de verificación del Privacy Gateway a una memory_entry.

    Devuelve (permitido, motivo_bloqueo).
    """
    if entry.get("local_only"):
        return False, "local_only"
    if entry.get("confidential"):
        return False, "confidential"
    if _project_local_only(entry["id"]):
        return False, "project_local_only"

    text = entry.get("content_processed") or entry.get("content_raw") or ""
    secrets = find_secrets(text)
    if secrets:
        return False, f"secret_pattern:{','.join(secrets)}"

    pii = find_pii(text)
    if pii:
        return False, f"pii_pattern:{','.join(pii)}"
    if find_health_context(text):
        return False, "pii_keyword:health_context"

    return True, None


def filter_context(entries: list[dict]) -> list[dict]:
    """Filtra memory_entries antes de que salgan como contexto RAG al modelo externo.

    Nunca lanza — las entradas bloqueadas se omiten y quedan logueadas.
    """
    allowed = []
    for entry in entries:
        ok, reason = is_entry_allowed(entry)
        if ok:
            allowed.append(entry)
        else:
            logger.info(
                "[jarvis.privacy] Fragmento bloqueado entry_id=%s motivo=%s",
                entry.get("id"), reason,
            )
    return allowed
