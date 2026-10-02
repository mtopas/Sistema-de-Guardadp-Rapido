"""Paridad con frontend/src/utils/cuerpoHoja.test.js para el helper Python
`app/hoja_cuerpo.py`.

El bot de Telegram usa este helper para que las notas de texto capturadas por
Telegram queden idénticas a las creadas desde la app (#12 + #13): cuerpo en
`apuntes`, título autogenerado de la primera línea.
"""
from app.hoja_cuerpo import (
    primer_link_en_cuerpo,
    texto_plano_a_html,
    titulo_desde_cuerpo,
)


class TestTituloDesdeCuerpo:
    def test_usa_primera_linea_no_vacia(self):
        assert titulo_desde_cuerpo("Comprar pan\ny más cosas") == "Comprar pan"

    def test_saltea_lineas_en_blanco_al_principio(self):
        assert titulo_desde_cuerpo("\n\n   \nPrimera real\notra") == "Primera real"

    def test_link_solo_deriva_dominio_sin_www(self):
        assert titulo_desde_cuerpo("https://www.ejemplo.com/ruta/larga?x=1") == "ejemplo.com"

    def test_texto_mas_link_conserva_texto_y_descarta_url(self):
        assert titulo_desde_cuerpo("Ver esto https://ejemplo.com/post ahora") == "Ver esto ahora"

    def test_cuerpo_vacio_o_espacios_devuelve_sin_titulo(self):
        assert titulo_desde_cuerpo("") == "Sin título"
        assert titulo_desde_cuerpo("   \n  \n") == "Sin título"
        assert titulo_desde_cuerpo(None) == "Sin título"

    def test_quita_marcadores_markdown_de_apertura(self):
        assert titulo_desde_cuerpo("# Título con hash") == "Título con hash"
        assert titulo_desde_cuerpo("- item de lista") == "item de lista"
        assert titulo_desde_cuerpo("1. primero") == "primero"
        assert titulo_desde_cuerpo("> cita") == "cita"

    def test_trunca_a_longitud_maxima(self):
        largo = "a" * 200
        assert len(titulo_desde_cuerpo(largo)) == 80
        assert titulo_desde_cuerpo(largo, 10) == "a" * 10

    def test_no_sanea_caracteres_invalidos_de_archivo(self):
        # El saneo de nombre de archivo lo hace el vault writer, no este helper;
        # acá solo verificamos que no explota y devuelve el texto tal cual.
        assert titulo_desde_cuerpo("a:b*c?d") == "a:b*c?d"


class TestTextoPlanoAHtml:
    def test_envuelve_parrafo_simple(self):
        assert texto_plano_a_html("hola mundo") == "<p>hola mundo</p>"

    def test_separa_parrafos_y_salto_simple_en_br(self):
        assert texto_plano_a_html("a\nb\n\nc") == "<p>a<br>b</p><p>c</p>"

    def test_escapa_html_del_usuario(self):
        assert texto_plano_a_html("<script>x</script>") == "<p>&lt;script&gt;x&lt;/script&gt;</p>"

    def test_cuerpo_vacio_devuelve_string_vacio(self):
        assert texto_plano_a_html("") == ""
        assert texto_plano_a_html("   ") == ""
        assert texto_plano_a_html(None) == ""


class TestPrimerLinkEnCuerpo:
    def test_encuentra_el_primer_link_cuando_hay_varios(self):
        assert primer_link_en_cuerpo("texto https://uno.com y https://dos.com") == "https://uno.com"

    def test_encuentra_link_en_el_medio(self):
        assert primer_link_en_cuerpo("bla bla https://ejemplo.com/x final") == "https://ejemplo.com/x"

    def test_lo_encuentra_dentro_de_html(self):
        assert primer_link_en_cuerpo('<p>mirá <a href="https://ejemplo.com">acá</a></p>') == "https://ejemplo.com"

    def test_devuelve_none_cuando_no_hay_link(self):
        assert primer_link_en_cuerpo("solo texto plano") is None
        assert primer_link_en_cuerpo("") is None
        assert primer_link_en_cuerpo(None) is None

    def test_recorta_puntuacion_final(self):
        assert primer_link_en_cuerpo("fijate en https://ejemplo.com.") == "https://ejemplo.com"
