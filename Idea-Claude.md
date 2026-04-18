# Sistema de Guardado Rápido — Descripción del Proyecto

## La idea en una frase

Un sistema para **capturar texto, enlaces y fotos**, **organizarlos en categorías jerárquicas** y **recuperarlos con contexto** — con apuntes, búsqueda y ayuda activa — empezando por un flujo mínimo real desde el celular y la PC.

---

## El problema

Hoy guardamos cosas en un chat con nosotros mismos (tipo WhatsApp): links sin vista previa, temas mezclados, búsqueda prácticamente inutilizable. Cuando querés recuperar algo, tenés que abrir uno por uno y muchas veces no lo encontrás.

El dolor central es: **captura fácil, pero organización y recuperación deficientes.**

---

## La solución

1. Compartís un enlace, texto o foto hacia la app (usando el flujo nativo de "Compartir" del sistema).
2. Al guardar, elegís la categoría y subcategorías que correspondan.
3. Si no existe la categoría, la creás en ese mismo momento.
4. Después recuperás el contenido desde la app: por jerarquía, por detalle, con apuntes asociados.
5. Todo sincronizado entre celular y PC.

---

## Qué acepta el sistema

| Acepta | Detalle |
|--------|---------|
| **Texto** | Frases, notas, citas, cualquier cosa escrita o transcripta. |
| **Enlaces** | URLs tal cual, incluyendo links a videos (YouTube, Vimeo, etc.). |
| **Fotos** | Imágenes compartidas o sacadas desde la app. |

> **Videos:** no se guardan como archivo (nada de MP4 ni nada por el estilo). Si querés retener algo audiovisual, guardás el link donde está publicado. Así se evita almacenar archivos pesados y el modelo se mantiene en "referencia + contexto".

---

## Cómo está organizado el contenido

### Hojas
Cada ítem guardado es una **hoja**: tiene el contenido (link, texto o foto), metadatos (fecha, lugar, etc.) y una sección de apuntes.

### Categorías y subcategorías
El sistema usa una **jerarquía dinámica** que el usuario crea sobre la marcha. Por ejemplo:
- *IA → Aprender → Agents*
- *Libros → Recomendación → Desarrollo personal*

La idea es que las categorías no sean solo cajones, sino un **índice navegable** del conocimiento guardado. Cuando entrás a una categoría, ves los títulos de las hojas dentro; en el nivel más fino, título + breve resumen.

### Íconos por categoría
Cada categoría tiene un ícono elegible, y ese ícono define un "grupo". Las subcategorías usan variantes del mismo grupo (sin repetir el ícono de la categoría padre justo en el primer nivel hijo).

---

## Experiencia por plataforma

### Celular
Apenas abrís la app, está lista para cargar algo rápido: pegás texto, link o foto, y abajo seleccionás la categoría. El objetivo es que la captura sea lo más inmediata posible.

### PC
La primera impresión tiene que ser fuerte y llamar la atención. Se imagina algo tipo las redes de Notion, pero jerárquico: nace de arriba y baja. Es el lugar ideal para leer el contenido con calma y tomar apuntes.

---

## Apuntes

Los apuntes tienen formato rico:
- **Negrita**, *cursiva*, subrayado.
- Listas ordenadas con múltiples estilos: `1/2/3`, `i/ii/iii`, `I/II/III`, `a/b/c`, `A/B/C`.
- Títulos y subtítulos.
- **Enlaces internos** tipo Obsidian: uso de `#` para conectar temas y linkear otras páginas internas.

---

## Más allá del guardado: features de organización activa

### Recordatorios, eventos y tareas
Se pueden guardar cosas con fecha, hora y/o lugar. El sistema detecta lenguaje natural para fechas: "este lunes", "el próximo martes", "el martes 15 de abril", "el lunes de la semana que viene", etc. También detecta palabras clave como lugar.

### Alertas
Las alertas se pueden configurar por:
- **Hora**
- **Día**
- **Lugar** (usando GPS, con rango de error configurable y permiso explícito)

### Transcripción de voz
Hay una opción para grabar texto en lugar de escribirlo. Sirve para guardar cosas rápido cuando no querés tipear. El sistema detecta palabras clave en la transcripción: categoría/subcategoría, fecha, hora, lugar, temas con `#`.

### Mapa y lugares
Se guardan lugares en un mapa. Se pueden filtrar por categoría (ej: cenas, cafés, bares, bodegones) y por proximidad. Por ejemplo: filtrar cafés cerca de la facultad estando en casa, si tenés guardada la ubicación de la facultad y los cafés.

Las fotos sacadas desde la app guardan automáticamente hora, fecha y lugar.

### Recordatorios recurrentes y configurables
Se pueden armar recordatorios periódicos con filtros. Por ejemplo: *"todos los martes a las 15hs, mostrarme todos los cafés a los que no fui"*. La idea es que el sistema no solo guarde información, sino que te ayude a usarla.

### Resumen del día
Al final de cada día, el sistema puede ofrecer un "Resumen del día": un vistazo a todo lo que subiste. Con la posibilidad de borrar rápido lo que ya no sirve.

### Papelera
Todo lo que se borra queda 24 horas en una papelera antes de eliminarse definitivamente.

---

## Vista enriquecida (idea de UX)

Una posible vista partida: el **enlace** al contenido (por ejemplo, un video reproduciéndose en la web) arriba, y el **panel de apuntes** abajo — sin almacenar el video como archivo.

---

## Identidad visual

- Fondo **violeta oscuro**.
- Acentos entre **rosa y violeta**.
- Los íconos de categoría son elegibles y se agrupan por familia.
- La gama de colores es configurable globalmente, y ese cambio podría afectar también el logo en desktop y celular.

> Todavía falta definir el nombre comercial y el logo.

---

## Gamificación

Para enganchar al usuario:
- Medallas o trofeos por hitos: hojas creadas, cantidad de links / fotos / textos / transcripciones / lugares / recordatorios, etc.
- La posibilidad de desbloquear configuraciones o ganar monedas para comprar paquetes de íconos o cambiar el tema de color.

---

## Configuración global

Todo lo que afecta la experiencia del usuario se puede modificar desde un único lugar:
- Tipografía (3 a 5 opciones predeterminadas).
- Tamaño de texto (5 tamaños predeterminados).
- Gama de colores (con impacto en logo e íconos).
- Cualquier otro parámetro de UX que tenga sentido centralizar.

---

## Bases de programación

- **Debug:** cada archivo tiene una variable `DEBUG = True` y usa `if DEBUG: ...` para los prints. Así se puede diagnosticar sin ruido en producción.
- **Configuración global:** todo lo configurable desde un solo lugar, como se describió arriba.

---

## Stack técnico

- **Backend:** Python + FastAPI.
- **Base de datos:** SQLite para empezar, PostgreSQL si escala.
- **Frontend:** algo simple al inicio (HTML mínimo, Streamlit o similar), React para versiones más completas.
- **Entrada adicional:** bot de Telegram que llama al mismo endpoint que el resto del sistema.

---

