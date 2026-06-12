# Testeos Ollama — Bot Telegram SGR

Registro de pruebas para validar respuestas del bot y ajustar prompts (`intent_router.py`, `assistant.py`) o handlers determinísticos (`finanzas_handlers.py`, etc.).

## Requisitos previos

| Servicio | Comando / URL |
|----------|----------------|
| API SGR | `uvicorn app.main:app --reload --port 8765` (desde `project/`) |
| Bot | `python mybot/bot.py` (desde `project/`, `TELEGRAM_BOT_TOKEN` en `.env`) |
| Ollama | Corriendo localmente (texto libre, `/pregunta`, confirmaciones LLM) |

**Ground truth Finanzas:** usar `/saldo` como referencia de total en cuentas antes de evaluar respuestas en lenguaje natural.

---

## Resumen de ejecución

| # | Prueba | Capa | OK | Notas |
|---|--------|------|----|-------|
| 1 | `/saldo` | Comando | ✅ | Coherente con la app |
| 2 | `¿Cuánta plata tengo?` | Router + síntesis | ❌ | Mezcla saldo + objetivos; aritmética inventada |
| 3 | `$: gasto 4500 … uala ayer` | Router LLM (no parser `$:`) | ❌ | Cuenta `ula aya` — sin fuzzy |
| 4 | `/mov` | Flujo guiado | ⏳ | Pendiente |
| 5 | `/mes` | Comando | ⏳ | Pendiente |
| 6 | `/ahorro` | Comando (FIRE/objetivos) | ⏳ | Pendiente |
| 7 | `/objetivo viaje` | Comando + fuzzy | ❌ | Fuzzy a otro objetivo; ahorrado negativo |
| 8 | `Gasté 8200 … uala` | Router + confirmación | ❌ | Cuenta `ªala` — sin fuzzy |
| 9 | `/hoy` + `/hecho …` | Comando Agenda/Hábitos | ⏳ | Pendiente |
| 10 | `/buscar python` + `/pregunta React` | API keyword vs RAG | ⚠️ | `/buscar` OK; `/pregunta` sin hits |

---

## Conclusiones del análisis (agente)

Los fallos **no apuntan a un solo bug**. Hay tres capas distintas:

| Capa | Pruebas afectadas | Síntoma | Archivo probable |
|------|-------------------|---------|------------------|
| Handlers determinísticos | 1 ✅, 7 ❌ | `/saldo` OK; `/objetivo` con acumulado negativo o fuzzy incorrecto | `finanzas_handlers.py` |
| Router LLM (clasificación + extracción) | 3, 8 | Cuenta mal escrita (`ula aya`, `ªala`) sin matchear contra `/fin/cuentas` | `intent_router.py` |
| Síntesis LLM (consultas) | 2 | Respuesta larga; mezcla saldo con metas; suma conceptos distintos | `assistant.py` `_gather_finanzas` + prompt |
| RAG / embeddings | 10 | `/buscar` funciona; `/pregunta` sin índice o sin notas del tema | `embeddings.py`, `assistant.py` `_gather_boveda` |

### Prioridades de fix sugeridas

| Prioridad | Qué | Dónde |
|-----------|-----|--------|
| **P0** | Preguntas de saldo: contexto = total ARS en cuentas (como `/saldo`); **no** incluir objetivos salvo que la pregunta hable de metas | `assistant.py` `_gather_finanzas` |
| **P0** | Post-procesar `datos.cuenta` con `_fuzzy_match()` contra cuentas reales antes de mostrar confirmación o ejecutar | `intent_router.py` |
| **P1** | `/objetivo`: fuzzy más estricto; acumulado negativo → explicar retiros netos o revisar movimientos con cat. homónima | `finanzas_handlers.py` `_build_objetivo` |
| **P2** | `/pregunta` Bóveda: verificar índice embeddings; fallback a `/buscar` si RAG vacío | `assistant.py` |
| **P3** | Aviso “Dólar no configurado” en `/saldo` | cosmético |

---

## Prueba 1 — Baseline Finanzas (sin LLM)

**Enviar:**
```
/saldo
```

**Capa:** `finanzas_handlers.py` → API `/fin/cuentas`

**Esperado:**
- Lista de cuentas con saldos ARS/USD coherentes con la app web.
- Total o equivalente USD razonable.

**Respuesta:**

```
🏦 Saldo por cuenta

  Banco Galicia  |  $0
  Efectivo  |  $0
  Uala  |  ARS $417.237,59
  Mercado Pago  |  $0
  Brubank  |  ARS $14.300

Total ARS: $431.537,59
Dólar no configurado — usá /dolar para actualizar
```

**OK:** ✅

**Análisis:** Referencia confiable. Usar **Total ARS: $431.537,59** para contrastar prueba 2. El aviso de dólar es esperable si no hay `dolar_mep`/`dolar_oficial` en config.

**Ajuste:** Ninguno en handler. Opcional: recordar `/dolar` o botón cotización en app.

---

## Prueba 2 — Consulta Finanzas vía Ollama

**Enviar:**
```
¿Cuánta plata tengo?
```

**Capa:** `intent_router.py` → `consulta_finanzas` → `assistant.py`

**Esperado:**
- 2–4 oraciones, tono directo.
- Total ARS = total cuentas de prueba 1 (~$431.537).
- Sin mezclar objetivos de ahorro con “plata disponible”.

**Respuesta:**

```
Para determinar cuánta plata tienes, necesitamos considerar varios factores.

Primero, tenemos el balance actual que se muestra como $431537.59.

Luego, podemos analizar los objetivos de ahorro. En este caso, hay dos objetivos:

1.  Brasil - Caro: con un objetivo de $1.080.000 y una cuota mensual de $60.000.
2.  Emergencia: sin cuota mensual establecida.

[… divaga sobre cuotas y 18 meses …]

$431537.59 + $1.080.000 = $1.511.537.59

Por lo tanto, según los datos proporcionados, tendrías un total de $1.511.537.59 en plata.
```

**OK:** ❌

**Análisis (agente):**
- El número $431.537 **coincide** con `/saldo` por casualidad, pero el modelo lo trata como “balance” genérico — en `_gather_finanzas()` el campo `balance` es **ingresos − gastos del mes**, no necesariamente saldo en cuentas (pueden divergir en otros meses).
- **Error conceptual grave:** suma meta de objetivo ($1.080.000) al saldo como si fuera dinero que tenés. Meta ≠ disponible.
- Ignora el prompt de síntesis (máx. 4 oraciones, no aritmética propia).
- **Causa probable:** el JSON de contexto incluye `objetivos_de_ahorro` junto con `cuentas`; el LLM los combina mal.

**Ajuste usuario:** Respondió al final pero divaga en objetivos primero.

**Ajuste técnico (P0):**
- Para preguntas tipo saldo/patrimonio: enviar solo `total_ars_cuentas`, `total_usd_cuentas`, desglose por cuenta.
- Excluir `objetivos_de_ahorro` del contexto salvo keywords (“objetivo”, “meta”, “cuánto falta”).
- Reforzar prompt: “Meta de ahorro no es dinero en cuenta”.

**vs /saldo:** Total cuentas $431.537,59 — número final $1.511.537,59 es **incorrecto** (inventa patrimonio).

---

## Prueba 3 — Captura rápida con fecha

**Enviar:**
```
$: gasto 4500 Super Coto uala ayer
```

**Capa esperada:** `finanzas_handlers.py` → parser `$:` → teclado categorías

**Capa real observada:** `intent_router.py` → confirmación LLM (“Entendí… Confianza 85%”)

**Esperado:**
- Preview con cuenta **Uala**, fecha ayer, teclado de categorías.

**Respuesta:**

```
🤖 Entendí: 💸 Gasto
• Monto: $4.500
• Descripción: Súper Coto
• Cuenta: ula aya

Confianza: 85%
```

**OK:** ❌

**Análisis (agente):**
- El mensaje **no pasó** por el parser `$:` — el router LLM lo interceptó antes.
- `ula aya` debería resolverse a **Uala** vía `_fuzzy_match()` (como en captura `$:`), pero el router no lo aplica hoy.
- Mismo bug que prueba 8.

**Ajuste usuario:** No detectó mi cuenta.

**Ajuste técnico (P0):** Fuzzy de cuenta en `format_summary` / `execute` del router. Opcional: priorizar prefijo `$:` antes del router en `bot.py`.

---

## Prueba 4 — Flujo guiado `/mov`

**Estado:** ⏳ Pendiente

**Enviar:** `/mov`

**Notas al ejecutar:** flujo inline keyboards; categorías ocultas no visibles; probar “➕ Nueva categoría”.

---

## Prueba 5 — Resumen del mes

**Estado:** ⏳ Pendiente

**Enviar:** `/mes`

**Notas al ejecutar:** comparar ingresos/gastos/tasa con dashboard Finanzas del mes actual.

---

## Prueba 6 — Modelo ahorro (FIRE + objetivos)

**Estado:** ⏳ Pendiente

**Enviar:** `/ahorro`

**Notas al ejecutar:** línea FIRE del mes; objetivos por categoría homónima; aviso si quedan mov. cat. `Ahorro` legacy.

---

## Prueba 7 — Progreso de objetivo (fuzzy)

**Enviar:**
```
/objetivo viaje
```

**Capa:** fuzzy match + acumulado por categoría = nombre objetivo

**Esperado:**
- Match al objetivo pedido (o mensaje “no encontré”).
- Ahorrado ≥ 0 si solo hay aportes (gastos en cat. del objetivo).

**Respuesta:**

```
🎯 Brasil - Caro
░░░░░░░░░░░░░ -33.3%

Ahorrado: $-360.000 de $1.080.000
Faltante: $1.440.000
Cuota mensual: $205.714,29
Meses aprox.: 7
Fecha límite: 2026-12-01
```

**OK:** ❌

**Análisis (agente):**
- **Fuzzy:** pediste `viaje`, matcheó **Brasil - Caro** — fuzzy demasiado permisivo o no hubo match y tomó el primero.
- **Ahorrado negativo:** con el modelo por categoría, significa **más ingresos que gastos** en cat. `Brasil - Caro` (retiros netos), o movimientos legacy (cat. `Ahorro` + descripción = nombre) que **no** entran en el acumulado por categoría homónima.
- La fórmula del bot (gasto suma, ingreso resta) es correcta; revisar datos en Datos → movimientos con categoría = nombre del objetivo.

**Ajuste usuario:** Ahorrado negativo; debería ser positivo.

**Ajuste técnico (P1):**
- Fuzzy: exigir match mínimo o listar candidatos si confianza baja.
- UX: si acumulado < 0, mostrar “Retiros netos: $X” en lugar de barra negativa confusa.
- **Datos a verificar:** ¿cuántos mov. en cat. `Brasil - Caro`? ¿tipo income vs expense?

---

## Prueba 8 — Intención guardar con confirmación LLM

**Enviar:**
```
Gasté 8200 en el super con la uala
```

**Capa:** `intent_router.py` → `finanzas` → teclado ✅ / ✏️ / ❌

**Esperado:**
- Cuenta **Uala**; botones Confirmar / Corregir / Cancelar.

**Respuesta:**

```
🤖 Entendí: 💸 Gasto
• Monto: $8.200
• Descripción: súper
• Cuenta: ªala

Confianza: 90%
```

**OK:** ❌

**Análisis (agente):** Mismo bug que prueba 3 — extracción LLM sin `_fuzzy_match` contra `/fin/cuentas`. Si el usuario confirma, el POST puede fallar o crear movimiento sin cuenta válida.

**Ajuste usuario:** No detectó mi cuenta.

**Ajuste técnico (P0):** Ver prueba 3.

---

## Prueba 9 — Agenda y Hábitos

**Estado:** ⏳ Pendiente

**Enviar:**
```
/hoy
```
```
/hecho Gimnasio
```

**Alternativa LLM:** `¿Qué tengo pendiente hoy?` → `consulta_agenda`.

---

## Prueba 10 — Bóveda: búsqueda vs consulta LLM

**Enviar:**
```
/buscar python
```

**Respuesta `/buscar`:**

```
Resultados para "python":

• 📝 Idea: CLI para SGR [Ideas]
• 📝 Docker multi-stage build para Python [DevOps]
• 🔗 https://docs.python.org/3/library/asyncio.html [Python]
• 📝 Dijkstra en Python [Algoritmos]
```

**Enviar:**
```
/pregunta ¿qué apuntes tengo sobre React?
```

**Respuesta `/pregunta`:**

```
No encontré notas relevantes o el índice semántico no está disponible. Probá /buscar <texto> para búsqueda por palabras.
```

**OK:** ⚠️

**Análisis (agente):**
- `/buscar` usa API keyword (`GET /hojas?q=`) — **OK**.
- `/pregunta` usa `embeddings.search()` — falló por **índice vacío / Ollama embed caído** o porque **no hay notas sobre React** (sí hay sobre Python).
- No es obligatorio que ambas den lo mismo: son mecanismos distintos.

**Ajuste usuario:** Esperaba respuesta similar en ambas; la segunda no detectó nada.

**Ajuste técnico (P2):**
- Probar control: `/pregunta ¿qué apuntes tengo sobre Python?` — si también falla → problema de índice, no de tema.
- Fallback: si RAG vacío, delegar a `/buscar` con keywords extraídas de la pregunta.

---

## Diagnóstico rápido

| Síntoma | Dónde mirar |
|---------|-------------|
| `/saldo`, `/mes`, `/ahorro` incorrectos | API, `crud.py`, `finanzas_handlers.py` |
| Texto libre clasifica mal (gasto vs pregunta) | `mybot/intent_router.py` |
| Clasifica bien pero respuesta larga o inventada | `mybot/assistant.py` |
| Cuenta mal en “Entendí…” | `intent_router.py` — falta fuzzy |
| `/objetivo` negativo o objetivo equivocado | Datos (categoría homónima) + `_build_objetivo` |
| `/pregunta` siempre vacío | `embeddings.py`, modelo embed en Ollama |

---

## Histórico — sesión anterior (referencia)

<details>
<summary>Prueba “¿Cuánta plata tengo?” — respuesta alucinada (expandir)</summary>

Inventó “cuenta corriente” $2.507.651,66; cuentas en $0 incorrectas; conversión USD ≈ $0,30 absurda. Mismo tipo de fallo que prueba 2 actual (contexto + síntesis), distinto detalle.

</details>

---

## Próximos pasos

1. Implementar **P0** (contexto saldo + fuzzy cuenta en router).
2. Re-ejecutar pruebas **2, 3, 8**.
3. Completar pruebas **4–6, 9** pendientes.
4. Prueba 10 control: `/pregunta … Python?`
5. Prueba 7: auditar movimientos cat. `Brasil - Caro` en app → Datos.

*Orden sugerido: 1 ✅ → 6 → 7 (datos) → 2 → 8 → 10 → 3–5 → 9.*
