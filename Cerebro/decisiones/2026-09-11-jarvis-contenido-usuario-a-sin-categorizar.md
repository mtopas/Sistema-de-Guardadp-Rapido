# Contenido de usuario capturado por Jarvis entra por `00 - Sin categorizar/`, sin excepción

## Decisión

`write_entry()` no intenta elegir una carpeta PARA específica (Facultad/Salud/Proyectos/etc.) para
contenido que el usuario capturó vía Jarvis (Telegram, `/j`, captura pasiva, clarify). Todo entra
por `D:\Boveda\00 - Sin categorizar\` — igual que cualquier otra captura del sistema.

## Por qué

Jarvis no tiene (ni tuvo nunca) noción de dominio/categoría PARA — su clasificación (`type`:
RAW/SEMANTIC/DECISION/PROJECT/PEOPLE) es un eje distinto, de contenido, no de dónde vive el archivo
(ver la entrada grande de `decisiones-implementacion.md`, "la hipótesis inicial... se descartó").
Inventar una heurística de clasificación PARA nueva y específica de Jarvis sería una decisión de
diseño mayor no pedida, y además rompería la regla ya establecida de que TODO lo capturado sin
clasificar entra por el inbox y se categoriza después (a mano, o con la sugerencia del worker que
ya se diseñó para Bóveda en general). Consistente, no una excepción nueva.

## Impacto

`jarvis/vault/writer.py::write_entry()` — rama `authorship != 'jarvis_synthesis'` escribe siempre en
`JARVIS_BOVEDA_PATH / "00 - Sin categorizar"`.
