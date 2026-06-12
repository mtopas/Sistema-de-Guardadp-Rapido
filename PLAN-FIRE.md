## Análisis tab FIRE — moneda y coherencia del plan

Revisé `FireTab.jsx`, `FireRightPanel.jsx`, `fireConfigUtils.js`, `finanzas.js` y cómo entran los movimientos categoría **FIRE**. Hay una **mezcla USD/ARS** que explica la sensación de que “algo no cierra”.

---

### Cómo está armado hoy

| Pieza | Moneda implícita | Qué hace |
|--------|------------------|----------|
| `fire_meta_usd` | **USD** | Meta FIRE (ej. 500.000 USD) |
| `ProyeccionRow` (tarjetas por edad) | **USD** principal | SWR 4% en USD; ARS solo como equivalente |
| Tabla mensual (aporte, saldo, interés, ahorrado, falta) | **ARS** (`fmtARS` en todo) | Motor del plan |
| `fire_aporte_inicial`, `fire_saldo_inicial` | **ARS** (dice el i18n) | Semilla del plan |
| `fire_aumento_aporte` (default **1,20%/mes**) | Sobre el aporte **en ARS** | Compuesto mes a mes |
| `fire_rentabilidad_anual` (default **6%**) | Sobre el saldo **en ARS** | Interés mensual = 6%/12 |
| Movimientos cat. FIRE | **Sin conversión** | `contribucionFire` suma el `monto` crudo |
| `fin_fire_filas` (override) | Número plano | Se muestra como ARS |
| ¿Llegaste a la meta? | Híbrido | `saldoMetaARS = metaUSD × dolar_hoy` |

La meta y la proyección “bonita” hablan **USD**; el plan mensual y los movimientos corren en **pesos nominales**. Son dos modelos distintos pegados en la misma pantalla.

---

### ¿Tiene sentido registrar pesos?

**Para el día a día en Argentina, sí** — pagás en ARS, transferís MEP, etc.

**Para el plan FIRE tal como está modelado, no del todo** — si tu objetivo es independencia en **USD** (meta en USD, SWR 4% en USD, rentabilidad tipo S&P), lo que importa es **cuántos dólares ahorraste/invertiste cada mes**, no cuántos pesos nominales moviste.

Problemas concretos hoy:

**1. Movimientos USD y ARS se suman igual**

```87:88:project/frontend/src/data/finanzas.js
export function contribucionFire(mov) {
  return isCategoriaFire(mov) ? contribucionCategoria(mov) : 0
}
```

Un gasto FIRE de **US$ 500** y uno de **$ 500.000 ARS** entran como `500` y `500000` en la misma columna “Ahorrado”. No se usa `mov.moneda` ni el dólar del mes.

**2. Devaluación distorsiona el plan**

Si ahorrás en USD pero registrás el equivalente en pesos al tipo del día, el “Ahorrado” sube cuando sube el dólar aunque en USD hayas aportado lo mismo. La columna “Falta” deja de medir si cumpliste el plan en términos reales.

**3. El 6% de rentabilidad no es “en pesos” en la cabeza FIRE**

`fire_rentabilidad_anual = 6%` es la hipótesis clásica de **retorno nominal en activos en dólares** (acciones USA, etc.). Aplicarlo sobre un saldo acumulado en **ARS** mezcla:

- retorno de portfolio USD  
- más inflación/devaluación argentina embebida en el saldo ARS  

No es lo mismo que “6% real en dólares”.

**4. El “incremento del aporte” tampoco está en USD**

El campo es `fire_aumento_aporte` — default **1,20% por mes** (~15% anual compuesto), no 6%. Ese % se aplica al **aporte planificado en ARS**:

```287:289:project/frontend/src/components/finanzas/FireTab.jsx
const aporte = result.length === 0
  ? aporteInicial
  : prevAportePlan * (1 + aumentoMensual)
```

Si tu idea mental es “cada año aumento mis aportes un X% **en dólares**” (o 6% anual), el motor actual no lo representa: escala pesos nominales del plan, independiente de cuánto USD guardaste.

**5. Meta USD vs saldo ARS**

Comparar `saldoFinal` (ARS del plan) con `metaUSD × dolar_de_hoy` hace que **el año FIRE proyectado se mueva** cuando cambia el MEP, aunque tu patrimonio en USD no cambió.

**6. Saldo “real” de cuentas casi no gobierna el plan**

`ProyeccionRow` muestra cuentas si difieren >$1000 del plan, pero **`saldoHoy` sigue siendo el saldo de la tabla** (cadena desde `fire_saldo_inicial` + movimientos FIRE), no el patrimonio USD de Ahorro/cuentas.

---

### Sobre “el 6% en dólares”

Hay **dos porcentajes** distintos en config:

| Campo | Default | Etiqueta UI | Interpretación razonable |
|-------|---------|-------------|---------------------------|
| `fire_rentabilidad_anual` | **6%** | Rentabilidad anual | Retorno del **portafolio en USD** |
| `fire_aumento_aporte` | **1,20%/mes** | Crecimiento aporte/mes | Escalón del **aporte objetivo** (¿USD o ARS? hoy: ARS) |

Si te referís al **6%**, encaja con **rentabilidad**: debería aplicarse sobre **saldo en USD**, no sobre pesos.

Si te referís al **incremento del aporte**, el default no es 6% sino 1,2%/mes; pero la lógica correcta para FIRE en Argentina suele ser **escalar aportes en USD** (o en “unidades de ahorro USD”), no en ARS nominales.

---

### Qué corregiría (por prioridad)

#### A. Modelo recomendado: **plan FIRE en USD**

Un solo motor en **USD**; ARS solo como vista secundaria (× MEP del mes o MEP actual).

| Concepto | Fuente |
|----------|--------|
| Ahorrado del mes | Movimientos FIRE → USD (`monto` si USD; `monto / TC` si ARS) |
| Aporte plan / saldo inicial config | Campos en **USD** (renombrar o nuevas keys) |
| `fire_aumento_aporte` | % mensual sobre **aporte USD** |
| `fire_rentabilidad_anual` | 6% sobre **saldo USD** |
| Meta | `saldoUSD >= fire_meta_usd` (sin multiplicar por dólar) |
| Tabla | Columnas primarias USD; tooltip o subfila ARS |

**Registro de movimientos:** seguir pudiendo cargar en ARS o USD en el modal; la conversión a USD para FIRE es **en el helper**, no obligar al usuario a pensar en dólares al tipear.

#### B. Fixes mínimos (si no querés refactor grande aún)

1. **`contribucionFireUSD(mov, dolar)`** — respetar `moneda`; usar TC del movimiento o MEP del mes.
2. **Etiquetas honestas** — si el plan sigue en ARS, decir “plan nominal ARS (sujeto a tipo de cambio)”.
3. **Separar rentabilidad** — documentar que 6% es sobre equivalente USD del saldo, no sobre pesos en efectivo.
4. **Overrides `fin_fire_filas`** — aclarar moneda o guardar en USD.

#### C. Decisiones de producto a tomar

| # | Pregunta | Recomendación |
|---|----------|---------------|
| F1 | ¿Moneda del plan? | **USD** (alineado a meta y SWR) |
| F2 | ¿Movimientos FIRE en ARS? | Sí, con conversión automática a USD para el plan |
| F3 | ¿`fire_aumento_aporte`? | Sobre aporte **USD**; si querés ~6% **anual**, ≈ 0,49%/mes, no 1,2%/mes |
| F4 | ¿Saldo inicial del plan? | Preferir **patrimonio FIRE en USD** (Ahorro + cuentas USD), no `fire_saldo_inicial` ARS manual |
| F5 | ¿TC para convertir ahorro histórico? | MEP del mes del movimiento (ideal) o MEP actual (más simple v1) |

---

### Síntomas que verías hoy en la UI

- Cargás aportes FIRE en pesos → el plan “Ahorrado” sube fuerte en meses de salto del dólar aunque en USD aportaste poco.
- Meta en USD pero tabla en ARS → el “Año FIRE” del panel derecho cambia cuando actualizás cotización.
- Aporte plan crece 1,2%/mes en ARS → “Falta” compara contra un objetivo en pesos que no es tu objetivo real en USD.
- Movimiento en USD cuenta mal vs uno en ARS (misma cifra numérica, distinto significado).

---

### Conclusión directa

**Registrar pesos tiene sentido operativo; usar pesos nominales para todo el motor FIRE no**, si tu meta, tu rentabilidad del 6% y tu incremento de ahorro están pensados en **dólares**.

Lo coherente con el resto del módulo (meta USD, proyección SWR en USD, portafolio Ahorro en USD) es:

> **Movimientos en la moneda que quieras → plan FIRE siempre en USD → ARS solo como equivalente informativo.**

---
