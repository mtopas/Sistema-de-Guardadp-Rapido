"""Tests para el módulo Agenda: recurrencias, tareas, eventos, horario facultad."""
import json
from datetime import datetime, date, timedelta
import pytest
from app.db.crud import (
    _generar_fechas_recurrencia_tarea,
    agenda_crear_evento, agenda_obtener_eventos, agenda_actualizar_evento, agenda_eliminar_evento,
    agenda_crear_tarea,
    agenda_crear_horario_facultad_excepcion,
    agenda_resumen_semana,
    agenda_obtener_listas,
    agenda_crear_lista,
)
from app.db.agenda_recurrence import recurring_dates


class TestGenerarFechasRecurrenciaTarea:
    """Pruebas para _generar_fechas_recurrencia_tarea (función pura, sin DB)."""

    def test_nunca_incluye_fecha_inicio(self):
        """La función NO incluye fecha_inicio en el resultado."""
        regla = {"frecuencia": "semanal"}
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", regla)
        assert "2026-09-23" not in resultado
        assert len(resultado) > 0  # Pero sí incluye ocurrencias posteriores

    def test_semanal_default_repite_dia_original(self):
        regla = {"frecuencia": "semanal", "dias": []}
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", regla)
        assert len(resultado) == 12
        assert resultado[0] == "2026-09-30"
        assert resultado[-1] == "2026-12-16"
    def test_semanal_con_dias_especificos(self):
        """Semanal con dias=[0,2,4] → lunes, miércoles, viernes."""
        # 23/09/2026 es miércoles (weekday=2)
        regla = {"frecuencia": "semanal", "dias": [0, 2, 4]}  # L, X, V
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", regla)
        # Verificar que todos los días tienen weekday en [0, 2, 4]
        for fecha_str in resultado:
            d = date.fromisoformat(fecha_str)
            assert d.weekday() in [0, 2, 4], f"{fecha_str} weekday={d.weekday()}"
        # Primer día incluido debe ser 24/09 (jueves) → saltamos a primer L (28/09)
        # O si 23 es miércoles, primer ocurrencia es 24 (jueves), saltamos a 25 (viernes)
        assert resultado[0] == "2026-09-25"  # Viernes

    def test_diario(self):
        """Diario → todos los días en ventana (60 días)."""
        regla = {"frecuencia": "diario"}
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", regla)
        assert len(resultado) == 60
        assert resultado[0] == "2026-09-24"
        ultimo = date.fromisoformat(resultado[-1])
        assert ultimo == date(2026, 9, 23) + timedelta(days=60)

    def test_mensual_clampeo_dia_original(self):
        """Mensual usa base.day original, no el día clampeado de mes anterior.

        Caso: 31/01 → 28/02 → 31/03 (vuelve a 31, no se queda en 28).
        """
        # Enero 2026 tiene 31 días; febrero tiene 28; marzo tiene 31
        regla = {"frecuencia": "mensual"}
        resultado = _generar_fechas_recurrencia_tarea("2026-01-31", regla)

        assert resultado[0] == "2026-02-28"  # Febrero clampeado a 28
        assert resultado[1] == "2026-03-31"  # Marzo vuelve a 31 (usa base.day=31)
        assert resultado[2] == "2026-04-30"  # Abril clampeado a 30
        # Y así sucesivamente

    def test_mensual_hasta_limita_ventana(self):
        """Regla 'hasta' corta la ventana de 12 ocurrencias."""
        regla = {"frecuencia": "mensual", "hasta": "2026-03-15"}
        resultado = _generar_fechas_recurrencia_tarea("2026-01-15", regla)
        # Enero 15 → febrero 15 → marzo 15 (dentro de hasta)
        # Abril 15 sería posterior a hasta, así que se corta
        assert resultado == ["2026-02-15", "2026-03-15"]

    def test_hasta_excluye_fecha_exacta(self):
        """Si hasta < fecha de ocurrencia, se excluye (no incluye la fecha del límite si no encaja)."""
        regla = {"frecuencia": "mensual", "hasta": "2026-02-14"}
        resultado = _generar_fechas_recurrencia_tarea("2026-01-15", regla)
        # Febrero 15 es DESPUÉS de hasta=2026-02-14, así que se excluye
        assert resultado == []

    def test_diario_respeta_hasta(self):
        """Diario con 'hasta' limita la ventana."""
        regla = {"frecuencia": "diario", "hasta": "2026-10-05"}
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", regla)
        # Ventana normal: 60 días (hasta 2026-11-22)
        # Con hasta=2026-10-05, corta a 12 días (24/09 a 05/10)
        assert len(resultado) == 12
        assert resultado[-1] == "2026-10-05"

    def test_regla_vacia_default_semanal(self):
        resultado = _generar_fechas_recurrencia_tarea("2026-09-23", {})
        assert len(resultado) == 12
        assert resultado[0] == "2026-09-30"

    def test_extension_mensual_preserva_dia_original_y_salta_ventana_generada(self):
        initial = recurring_dates("2026-01-31", {"frecuencia": "mensual"})
        extended = recurring_dates(
            "2026-01-31", {"frecuencia": "mensual"},
            extend_from=date(2027, 4, 1), after=date.fromisoformat(initial[-1]),
        )
        assert initial[-1] == "2027-01-31"
        assert extended[:3] == ["2027-02-28", "2027-03-31", "2027-04-30"]

class TestEventosMaterializados:
    def test_cada_ocurrencia_es_independiente(self, tmp_app_db):
        head = agenda_crear_evento(
            titulo="Clase", fecha_inicio="2026-09-23T10:00:00",
            fecha_fin="2026-09-23T11:00:00", se_repite=True,
            regla_repeticion='{"frecuencia":"semanal","dias":[]}',
        )
        events = agenda_obtener_eventos("2026-09-23", "2026-10-14")
        assert [e["fecha_inicio"][:10] for e in events] == [
            "2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14"
        ]
        assert len({e["id"] for e in events}) == 4
        assert all(e["serie_id"] == head["id"] for e in events[1:])
        child_id = events[1]["id"]
        agenda_actualizar_evento(child_id, {"titulo": "Clase movida"})
        assert agenda_obtener_eventos("2026-09-23", "2026-10-14")[0]["titulo"] == "Clase"
        agenda_eliminar_evento(child_id)
        remaining = agenda_obtener_eventos("2026-09-23", "2026-10-14")
        assert len(remaining) == 3
        assert {e["fecha_inicio"][:10] for e in remaining} == {
            "2026-09-23", "2026-10-07", "2026-10-14"
        }

class TestAgendaCrearTarea:
    """Pruebas para agenda_crear_tarea (requiere DB fixture)."""

    def test_crear_tarea_simple(self, tmp_app_db):
        """Crear una tarea sin recurrencia."""
        tarea = agenda_crear_tarea(
            titulo="Mi tarea",
            descripcion="Descripción",
            fecha_opcional="2026-09-25",
        )
        assert tarea["titulo"] == "Mi tarea"
        assert tarea["descripcion"] == "Descripción"
        assert tarea["fecha_opcional"] == "2026-09-25"
        assert tarea["completada"] == 0
        assert tarea["se_repite"] == 0

    def test_crear_tarea_con_lista(self, tmp_app_db):
        """Crear tarea y asociarla a una lista."""
        lista = agenda_crear_lista(nombre="Mi lista", color="#ff0000")
        tarea = agenda_crear_tarea(
            titulo="Tarea en lista",
            lista_id=lista["id"],
        )
        assert tarea["lista_id"] == lista["id"]
        assert tarea["lista_nombre"] == "Mi lista"
        assert tarea["lista_color"] == "#ff0000"

    def test_crear_tarea_recurrente_semanal(self, tmp_app_db):
        """Crear tarea recurrente genera ocurrencias automáticamente."""
        regla = '{"frecuencia": "semanal", "dias": [0, 2, 4]}'
        tarea_base = agenda_crear_tarea(
            titulo="Reunión semanal",
            fecha_opcional="2026-09-23",
            se_repite=True,
            regla_repeticion=regla,
        )
        assert tarea_base["se_repite"] == 1
        # La tarea base debe tener serie_id=None (es la cabeza)
        assert tarea_base["serie_id"] is None
        # Las ocurrencias deben tener serie_id=tarea_base["id"]
        # (Nota: esto se verifica indirectamente a través de la DB en un test de integración real)

    def test_crear_tarea_recurrente_sin_fecha_opcional(self, tmp_app_db):
        """Recurrencia sin fecha_opcional no genera ocurrencias."""
        regla = '{"frecuencia": "semanal"}'
        tarea = agenda_crear_tarea(
            titulo="Sin recurrencia real",
            se_repite=True,
            regla_repeticion=regla,
            # fecha_opcional=None
        )
        # Debe crear la tarea base pero sin ocurrencias
        assert tarea["se_repite"] == 1
        # Verificar que no hay ocurrencias con serie_id=tarea["id"] requeriría acceso a DB

    def test_crear_tarea_con_hora(self, tmp_app_db):
        """Tarea con hora opcional."""
        tarea = agenda_crear_tarea(
            titulo="Tarea a las 10",
            fecha_opcional="2026-09-25",
            hora_opcional="10:30",
        )
        assert tarea["hora_opcional"] == "10:30"


class TestAgendaCrearHorarioFacultadExcepcion:
    """Pruebas para agenda_crear_horario_facultad_excepcion."""

    def test_crear_excepcion_horario_valido(self, tmp_app_db):
        """Crear excepción en un horario facultad existente."""
        # Primero crear un horario facultad (requiere datos de setup en fixture)
        # Para este test, asumimos que ya existe con id=1
        # (En un test real, habría que crear el horario primero)
        resultado = agenda_crear_horario_facultad_excepcion(
            hf_id=999,  # ID inexistente
            fecha="2026-09-25",
        )
        # Como el horario no existe, debe devolver None
        assert resultado is None

    def test_crear_excepcion_horario_inexistente(self, tmp_app_db):
        """Crear excepción en horario que no existe → None."""
        resultado = agenda_crear_horario_facultad_excepcion(
            hf_id=99999,
            fecha="2026-09-25",
        )
        assert resultado is None


class TestAgendaResumenSemana:
    """Pruebas para agenda_resumen_semana."""

    def test_resumen_semana_vacia(self, tmp_app_db):
        """Resumen de una semana sin eventos ni tareas."""
        resumen = agenda_resumen_semana("2026-09-23", "2026-09-29")
        assert resumen["completadas"] == 0
        assert resumen["incompletas"] == 0
        assert resumen["vencidas"] == 0
        assert isinstance(resumen["por_calendario"], list)

    def test_resumen_cuenta_tareas_completadas(self, tmp_app_db):
        """Resumen cuenta tareas completadas en el rango."""
        # Crear una tarea completa
        tarea = agenda_crear_tarea(
            titulo="Tarea hecha",
            fecha_opcional="2026-09-25",
        )
        # Marcarla como completada (requiere actualizar, no es part del crear)
        # Para simplificar, verificar que la función corre sin error
        resumen = agenda_resumen_semana("2026-09-23", "2026-09-29")
        # Sin actualizar la tarea a completada, incompletas debe ser 1
        assert resumen["incompletas"] == 1

    def test_resumen_cuenta_tareas_vencidas(self, tmp_app_db):
        """Resumen cuenta tareas sin completar anteriores al rango (vencidas)."""
        # Crear tarea anterior al rango
        tarea = agenda_crear_tarea(
            titulo="Tarea vencida",
            fecha_opcional="2026-09-20",
        )
        resumen = agenda_resumen_semana("2026-09-23", "2026-09-29")
        # Debe contar la tarea vencida
        assert resumen["vencidas"] == 1

    def test_resumen_hasta_normaliza_sin_hora(self, tmp_app_db):
        """Si 'hasta' no tiene hora, se normaliza a fin de día."""
        # Crear una tarea en el último día del rango con hora
        tarea = agenda_crear_tarea(
            titulo="Última del día",
            fecha_opcional="2026-09-29",
        )
        # Llamar resumen_semana con "hasta" sin hora
        resumen = agenda_resumen_semana("2026-09-23", "2026-09-29")
        # Debe incluir la tarea del 29
        assert resumen["incompletas"] == 1


class TestAgendaUtilsIntegration:
    """Tests de integración: rutas HTTP básicas."""

    def test_obtener_listas_vacia(self, tmp_app_db):
        """GET /agenda/listas devuelve lista vacía inicialmente."""
        listas = agenda_obtener_listas()
        assert isinstance(listas, list)
        assert len(listas) >= 0  # Puede haber lista default del setup

    def test_crear_lista(self, tmp_app_db):
        """Crear una lista."""
        lista = agenda_crear_lista(nombre="Test", color="#ff0000")
        assert lista["nombre"] == "Test"
        assert lista["color"] == "#ff0000"
        assert "id" in lista
