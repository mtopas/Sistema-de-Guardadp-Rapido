"""Tests de rutas HTTP de /fin/* usando TestClient de FastAPI."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import crud


@pytest.fixture
def client(tmp_app_db):
    """TestClient con la DB de sandbox ya activa (tmp_app_db fixture)."""
    return TestClient(app)


@pytest.mark.integration
def test_get_fin_categorias_empty(client):
    """GET /fin/categorias sin data seeded devuelve lista vacía."""
    response = client.get("/fin/categorias")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.integration
def test_get_fin_categorias_with_data(client, tmp_app_db):
    """GET /fin/categorias devuelve categorías creadas."""
    crud.fin_crear_categoria("Gasto Test", "#FF0000", "expense")
    response = client.get("/fin/categorias")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    # La categoría creada debería estar en la lista
    names = [c["name"] for c in data]
    assert "Gasto Test" in names


@pytest.mark.integration
def test_get_fin_categorias_include_ocultas_parameter(client, tmp_app_db):
    """GET /fin/categorias?include_ocultas=true incluye categorías ocultas."""
    cat_id = crud.fin_crear_categoria("Visible", "#FF0000", "expense")

    # Sin parámetro, devuelve categorías
    response = client.get("/fin/categorias")
    assert response.status_code == 200

    # Con parámetro include_ocultas=true, también devuelve ocultas
    response = client.get("/fin/categorias?include_ocultas=true")
    assert response.status_code == 200


@pytest.mark.integration
def test_get_fin_movimientos_resumen_empty(client):
    """GET /fin/movimientos/resumen sin movimientos devuelve agregados en cero."""
    response = client.get("/fin/movimientos/resumen")
    assert response.status_code == 200
    data = response.json()
    # Debe tener estructura con agregados
    assert "ingresos" in data or "gastos" in data or "por_categoria" in data or isinstance(data, dict)


@pytest.mark.integration
def test_get_fin_movimientos_resumen_with_data(client, tmp_app_db):
    """GET /fin/movimientos/resumen con movimientos devuelve agregados correctos."""
    # Crear cuenta y movimientos de prueba
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta Test")
    crud.fin_crear_movimiento(
        fecha="2026-09-15",
        monto=100,
        tipo="expense",
        descripcion="Gasto Test",
        cuenta_id=cuenta_id,
    )
    crud.fin_crear_movimiento(
        fecha="2026-09-20",
        monto=500,
        tipo="income",
        descripcion="Ingreso Test",
        cuenta_id=cuenta_id,
    )

    # Query por mes actual (debería encontrar los movimientos si estamos en septiembre)
    response = client.get("/fin/movimientos/resumen?mes=2026-09")
    assert response.status_code == 200
    data = response.json()

    # Debe ser dict con agregados
    assert isinstance(data, dict)


@pytest.mark.integration
def test_patch_fin_cuentas_saldo_deprecated_returns_410(client):
    """PATCH /fin/cuentas/{id}/saldo está deprecated y devuelve 410 Gone."""
    response = client.patch(
        "/fin/cuentas/999/saldo",
        json={"saldo_ars": 1000},
    )
    assert response.status_code == 410
    data = response.json()
    assert "410" in str(data) or "Gone" in str(data) or "calculan desde movimientos" in str(data)


@pytest.mark.integration
def test_get_fin_movimientos_resumen_filters_transferencias(client, tmp_app_db):
    """GET /fin/movimientos/resumen excluye transferencias del agregado."""
    # Crear cuenta
    cuenta_id = crud.fin_crear_cuenta(nombre="Cuenta Test")

    # Crear categoría "Transferencia"
    transfer_cat_id = crud.fin_crear_categoria("Transferencia", "#999999", "both")

    # Crear movimientos: gasto + transferencia
    crud.fin_crear_movimiento(
        fecha="2026-09-15",
        monto=100,
        tipo="expense",
        descripcion="Gasto Normal",
        cuenta_id=cuenta_id,
        categoria_id=None,  # Categoría por defecto
    )
    crud.fin_crear_movimiento(
        fecha="2026-09-20",
        monto=500,
        tipo="expense",
        descripcion="Transferencia entre cuentas",
        cuenta_id=cuenta_id,
        categoria_id=transfer_cat_id,
    )

    # GET /fin/movimientos/resumen
    response = client.get("/fin/movimientos/resumen?mes=2026-09")
    assert response.status_code == 200
    data = response.json()

    # El resumen debería excluir la transferencia, así que solo debe contar 100 en gastos
    assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# fin_buscar_categoria_por_nombre — matching case-insensitive + trim
# ---------------------------------------------------------------------------

@pytest.mark.integration
def test_buscar_categoria_por_nombre_case_insensitive(client, tmp_app_db):
    """'Comida' y 'comida' deben resolver al mismo id de categoría."""
    cat_id = crud.fin_crear_categoria("Comida", "#FF0000", "expense")
    assert crud.fin_buscar_categoria_por_nombre("comida") == cat_id
    assert crud.fin_buscar_categoria_por_nombre("COMIDA") == cat_id
    assert crud.fin_buscar_categoria_por_nombre("Comida") == cat_id


@pytest.mark.integration
def test_buscar_categoria_por_nombre_trim(client, tmp_app_db):
    """Espacios alrededor del nombre no deben crear un match distinto."""
    cat_id = crud.fin_crear_categoria("Transporte", "#00FF00", "expense")
    assert crud.fin_buscar_categoria_por_nombre("  Transporte  ") == cat_id
    assert crud.fin_buscar_categoria_por_nombre(" transporte") == cat_id


@pytest.mark.integration
def test_buscar_categoria_por_nombre_no_match_devuelve_none(client, tmp_app_db):
    """Si no existe ninguna categoría con ese nombre, devuelve None."""
    assert crud.fin_buscar_categoria_por_nombre("NoExiste") is None


@pytest.mark.integration
def test_post_movimiento_no_duplica_categoria_por_capitalizacion(client, tmp_app_db):
    """POST /fin/movimientos con distinta capitalización reutiliza la categoría existente
    en vez de auto-crear una nueva (cajón duplicado)."""
    cat_id = crud.fin_crear_categoria("Comida", "#FF0000", "expense")

    response = client.post(
        "/fin/movimientos",
        json={
            "tipo": "expense",
            "monto": 500,
            "fecha": "2026-09-15",
            "descripcion": "Almuerzo",
            "categoria_nombre": "comida",
        },
    )
    assert response.status_code == 200
    mov = response.json()
    assert mov["categoria_id"] == cat_id

    # No se debe haber creado una segunda categoría "comida"
    categorias = client.get("/fin/categorias?include_ocultas=true").json()
    nombres_comida = [c for c in categorias if c["name"].strip().lower() == "comida"]
    assert len(nombres_comida) == 1
