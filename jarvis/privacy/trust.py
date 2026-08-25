"""
Trust propagation (spec §17) — origin_trust nunca aumenta en derivados.

Resumir o consolidar contenido `web.untrusted` diez veces no lo convierte
en `user.authenticated`. Cuando un claim derive de varias memory_entries
(consolidación, 0.2+), su origin_trust debe ser el más restrictivo entre
sus fuentes — nunca uno mayor.
"""

_TRUST_RANK = {
    "web.untrusted": 0,
    "migration": 1,
    "telegram.user": 2,
    "system": 2,
    "user.authenticated": 3,
}


def propagate_trust(source_trusts: list[str]) -> str:
    """Devuelve el origin_trust más restrictivo entre las fuentes dadas."""
    if not source_trusts:
        return "web.untrusted"
    return min(source_trusts, key=lambda t: _TRUST_RANK.get(t, 0))
