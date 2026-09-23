"""Tests para jarvis/privacy/gateway.py — detectores de secretos y PII."""
import pytest

from jarvis.privacy.gateway import (
    find_card_number,
    find_health_context,
    find_pii,
    find_secrets,
    is_entry_allowed,
)


class TestFindSecrets:
    """Patrones de secretos evidentes."""

    def test_openai_key_detected(self):
        text = "API key: sk-1234567890abcdefghijklmn"
        assert "openai_key" in find_secrets(text)

    def test_openai_key_too_short_not_detected(self):
        text = "API key: sk-abc"
        assert "openai_key" not in find_secrets(text)

    def test_github_pat_detected(self):
        text = "token ghp_1234567890abcdefghijklmnopqrstuvwxyz"
        assert "github_pat" in find_secrets(text)

    def test_slack_bot_token_detected(self):
        text = "bot token: xoxb-123-abc-xyz"
        assert "slack_bot_token" in find_secrets(text)

    def test_bearer_token_detected(self):
        text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIs"
        assert "bearer_token" in find_secrets(text)

    def test_password_inline_detected_colon(self):
        text = "password:mysecret123"
        assert "password_inline" in find_secrets(text)

    def test_password_inline_detected_equals(self):
        text = "password=secretpass"
        assert "password_inline" in find_secrets(text)

    def test_api_key_inline_detected(self):
        text = "api_key:xyz123abc"
        assert "api_key_inline" in find_secrets(text)

    def test_api_key_inline_variant_detected(self):
        text = "apikey = secrettoken"
        assert "api_key_inline" in find_secrets(text)

    def test_empty_text_returns_empty_list(self):
        assert find_secrets("") == []

    def test_none_text_returns_empty_list(self):
        assert find_secrets(None) == []

    def test_multiple_secrets_detected(self):
        text = "sk-abc1234567890abcdefgh and password=secret"
        secrets = find_secrets(text)
        assert "openai_key" in secrets
        assert "password_inline" in secrets


class TestFindCardNumber:
    """Validación de números de tarjeta (Luhn)."""

    def test_valid_card_number_16_digits(self):
        # 4532015112830366 es válida por Luhn
        text = "Tarjeta: 4532 0151 1283 0366"
        assert find_card_number(text) is True

    def test_valid_card_number_15_digits(self):
        # 378282246310005 es válida por Luhn (American Express 15 dígitos)
        text = "378282246310005"
        assert find_card_number(text) is True

    def test_invalid_card_number_fails_luhn(self):
        # Secuencia válida en formato pero falla Luhn
        text = "1111111111111111"  # todos 1s
        assert find_card_number(text) is False

    def test_card_number_with_dashes(self):
        text = "4532-0151-1283-0366"
        assert find_card_number(text) is True

    def test_card_number_with_spaces(self):
        text = "4532 0151 1283 0366"
        assert find_card_number(text) is True

    def test_too_short_digit_sequence(self):
        text = "123 456 789"  # 9 dígitos, menos del mínimo de 13
        assert find_card_number(text) is False

    def test_too_long_digit_sequence(self):
        text = "12345678901234567890123456"  # 26 dígitos, más del máximo de 19
        assert find_card_number(text) is False

    def test_empty_text_returns_false(self):
        assert find_card_number("") is False

    def test_none_text_returns_false(self):
        assert find_card_number(None) is False


class TestFindPII:
    """Patrones de PII estructurado."""

    def test_cuit_cuil_detected(self):
        text = "CUIT: 20-30123456-7"
        assert "cuit_cuil" in find_pii(text)

    def test_cuit_with_wrong_format_not_detected(self):
        text = "20301234567"  # sin guiones
        assert "cuit_cuil" not in find_pii(text)

    def test_dni_con_contexto_detected(self):
        text = "DNI: 12.345.678"
        assert "dni_con_contexto" in find_pii(text)

    def test_dni_con_palabra_documento(self):
        text = "documento 12345678"
        assert "dni_con_contexto" in find_pii(text)

    def test_dni_sin_contexto_not_detected(self):
        text = "12345678"  # solo números, sin "DNI" o "documento"
        assert "dni_con_contexto" not in find_pii(text)

    def test_cbu_cvu_detected(self):
        text = "CBU: 0720034735000001112345"  # 22 dígitos
        assert "cbu_cvu" in find_pii(text)

    def test_cbu_cvu_too_short_not_detected(self):
        text = "123456789012345678901"  # 21 dígitos
        assert "cbu_cvu" not in find_pii(text)

    def test_card_number_detected_as_pii(self):
        text = "4532015112830366"
        assert "card_number" in find_pii(text)

    def test_empty_text_returns_empty_list(self):
        assert find_pii("") == []

    def test_multiple_pii_detected(self):
        text = "CUIT: 20-30123456-7 y CBU: 0720034735000001112345"
        pii = find_pii(text)
        assert "cuit_cuil" in pii
        assert "cbu_cvu" in pii


class TestFindHealthContext:
    """Palabras clave de contexto de salud."""

    def test_diagnóstico_detected(self):
        text = "Se le hizo un diagnóstico de diabetes"
        assert find_health_context(text) is True

    def test_enfermedad_detected(self):
        text = "historia de enfermedad crónica"
        assert find_health_context(text) is True

    def test_medicacion_detected(self):
        text = "medicación para la hipertensión"
        assert find_health_context(text) is True

    def test_tratamiento_medico_detected(self):
        text = "iniciamos tratamiento médico"
        assert find_health_context(text) is True

    def test_sindrome_detected(self):
        text = "síndrome de fatiga crónica"
        assert find_health_context(text) is True

    def test_psiquiatrico_detected(self):
        text = "evaluación psiquiátrica realizada"
        assert find_health_context(text) is True

    def test_resultado_positivo_detected(self):
        text = "resultado: positivo"
        assert find_health_context(text) is True

    def test_historia_clinica_detected(self):
        text = "según la historia clínica del paciente"
        assert find_health_context(text) is True

    def test_random_text_not_detected(self):
        text = "el clima hoy es muy agradable"
        assert find_health_context(text) is False

    def test_empty_text_returns_false(self):
        assert find_health_context("") is False

    def test_none_text_returns_false(self):
        assert find_health_context(None) is False

    def test_case_insensitive_detection(self):
        text = "DIAGNÓSTICO de anemia"
        assert find_health_context(text) is True


class TestIsEntryAllowedSimple:
    """Tests de is_entry_allowed que NO necesitan DB (sin fixture)."""

    def test_local_only_entry_blocked(self, tmp_jarvis_db):
        """local_only flag bloquea sin consultar DB."""
        entry = {
            "id": "test-1",
            "local_only": True,
            "content_processed": "normal content",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert reason == "local_only"

    def test_confidential_entry_blocked(self, tmp_jarvis_db):
        """confidential flag bloquea sin consultar DB."""
        entry = {
            "id": "test-1",
            "confidential": True,
            "content_processed": "normal content",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert reason == "confidential"

    def test_entry_with_secret_blocked(self, tmp_jarvis_db):
        """Secreto en contenido bloquea."""
        entry = {
            "id": "test-1",
            "content_processed": "mi API key es sk-1234567890abcdefghij",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert "secret_pattern" in reason

    def test_entry_with_cuit_blocked(self, tmp_jarvis_db):
        """PII en contenido bloquea."""
        entry = {
            "id": "test-1",
            "content_processed": "CUIT del cliente: 20-30123456-7",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert "pii_pattern" in reason

    def test_entry_with_health_context_blocked(self, tmp_jarvis_db):
        """Contexto de salud en contenido bloquea."""
        entry = {
            "id": "test-1",
            "content_processed": "medicación para la diabetes",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert reason == "pii_keyword:health_context"

    def test_clean_entry_allowed(self, tmp_jarvis_db):
        """Contenido normal pasa todos los chequeos."""
        entry = {
            "id": "test-1",
            "content_processed": "Este es un contenido normal sin datos sensibles",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is True
        assert reason is None

    def test_entry_with_only_content_raw_checked(self, tmp_jarvis_db):
        """Si content_processed es None, se usa content_raw."""
        entry = {
            "id": "test-1",
            "content_raw": "Contenido sin procesar, normal",
            "content_processed": None,
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is True

    def test_entry_with_secret_in_raw_blocked(self, tmp_jarvis_db):
        """Secreto en content_raw bloquea si content_processed es None."""
        entry = {
            "id": "test-1",
            "content_raw": "sk-1234567890abcdefghij",
            "content_processed": None,
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is False
        assert "secret_pattern" in reason


class TestIsEntryAllowedWithDB:
    """Tests de is_entry_allowed que necesitan DB (project_local_only)."""

    def test_entry_not_associated_with_project_allowed(self, tmp_jarvis_db):
        """Sin vinculación a proyecto, el chequeo de project_local_only pasa."""
        entry = {
            "id": "test-1",
            "content_processed": "contenido normal",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is True
        assert reason is None

    def test_entry_with_falsy_flags_allowed(self, tmp_jarvis_db):
        """Flags explícitamente False o None no bloquean."""
        entry = {
            "id": "test-1",
            "local_only": False,
            "confidential": None,
            "content_processed": "contenido normal",
        }
        allowed, reason = is_entry_allowed(entry)
        assert allowed is True
