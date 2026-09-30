# Handoffs de Coordinación — SGR / Jarvis

Este archivo es la **cadena de custodia persistente** entre sesiones del Orquestador de SGR.
A diferencia del chat (cuyo contexto se pierde al cerrar la ventana), este archivo mantiene la memoria viva del proyecto en disco.

## Reglas de uso para el Orquestador:
1. **Orden cronológico inverso (lo nuevo ARRIBA):** Cada nuevo handoff se inserta **inmediatamente debajo de este encabezado** (arriba de los anteriores). Los handoffs viejos nunca se borran; se van desplazando hacia abajo.
2. **Lectura al arrancar:** Toda nueva sesión orquestadora arranca leyendo los primeros 30-50 renglones de este archivo para absorber el estado actual y los pendientes activos.
3. **Arrastre de pendientes (Cadena de custodia):** Cada vez que un trabajador entrega su resumen, el orquestador toma la lista de pendientes del handoff anterior:
   - Marca o retira los que se acaban de resolver.
   - Suma los pendientes o sugerencias nuevas que trajo el trabajador.
   - Pega la lista consolidada de **Pendientes activos** en el nuevo handoff en el tope.
4. **Respaldo en disco:** Al recibir el resumen de la sesión de trabajo, el orquestador actualiza este archivo en el mismo turno.

---

## [2026-09-30 12:50] — Cierre de sesión: Creación de infraestructura de roles Orquestador / Trabajador y memoria unificada
- **Resultado:** Hecho
- **Estado del repo:** Rama `master` sincronizada con `origin/master` (376 tests backend / 184 frontend en verde).
- **Notas creadas/tocadas:**
  - [[PROMPT-MAESTRO-TRABAJADOR]]: Nueva infraestructura para sesiones técnicas ejecutoras en SGR (Modo Cavernícola, tests de regresión obligatorios, regla de 3 intentos y commits atómicos directos).
  - [[PROMPT-MAESTRO-ORQUESTADOR]]: Rol de Tech Lead de SGR con debate de Alta Densidad de Señal y tickets compactos.
  - `Cerebro/Handoff.md`: Creación de la cadena de custodia viva unificada (reemplazando los handoffs dispersos por fecha).
  - Punteros de slash commands en `.claude/commands/`, `.agents/skills/`, `.opencode/commands/` y `AGENTS.md`.

### Pendientes activos (Arrastre):
- [ ] [DEPLOY / HOMELAB] Deploy pendiente al Homelab (`192.168.137.10:8765`): incluye Jarvis, auditorías de Finanzas/Agenda/Hábitos y fix de `serie_id` (seguir procedimiento en `HOMELAB.md`).
- [ ] [BOT / UX] Corregir gap en bot de Telegram (`project/mybot/finanzas_handlers.py:940`: `extra_str` omitido en `reply_text`).
- [ ] [FRONTEND] Evaluar exploraciones de rediseño frontend en `Front-CLAUDE/` y `Front-GPT/`.
- [ ] [REFACTOR / LIMPIEZA] Limpieza de imports huérfanos señalados por pyflakes en `project/app/main.py:29-31` y variables muertas en `crud.py`.
- [ ] [BACKLOG] Revisar `Cerebro/PROXIMAMENTE.md` para tachar ítems resueltos por las últimas auditorías.

- **Próximo objetivo inmediato recomendado:** Deploy al homelab siguiendo `HOMELAB.md` o corrección del gap en `finanzas_handlers.py`.
- **Decisiones / Alertas:** La suite de tests corre contra checkout limpio: `python -m pytest project/tests` (376 passed) + `npm test` en frontend.

---

## [2026-09-27] — Auditoría de Handoff anterior y fix de serie_id (Resumen histórico heredado)
- **Resultado:** Hecho, commit `4b2b728`
- **Qué se hizo:** Fix de import `agenda_detener_serie` en `project/app/main.py:122` + test de regresión `test_detener_serie_valida_tipo_y_existencia` en `project/tests/test_agenda_routes.py:258`. Barrido estático con `pyflakes` (0 nombres indefinidos restantes).
- **Estado verificado:** 376 backend passed, 0 skip + 184 frontend passed + `npm run build` limpio.
