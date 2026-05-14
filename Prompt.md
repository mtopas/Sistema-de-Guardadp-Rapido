# MIGRANDO DE ClaudeDesign A project

# BÓVEDA

[✅] Lo primero que vamos a actualizar dentro de project es el gráfico de ClaudeDesign. Mantengamos su formato y diseño en su totalidad
pero conectemoslo a nuestra base de datos, nuestras categorías y demas.

[✅] Ahora quiero que copiemos la barra superior. Formatos de texto, tipografías, botones. El botón de notificaciones por ahora que no funcione. El boón de actualizar, bórralo. Move el botón de capturar, el logo del usuario, el nombre homelab-local y la config.

[✅] Quiero que migremos el cuadro de atajo pero que sea CNTRL+M. Lo de densidad lo borramos. Lo de tono base me gusta para que lo implementemos. Agreguemoslo. En vez de "Acento" usamos nuestros "Temas".

## Temas

Te paso las 6 paletas. Cada una respeta la misma estructura de variables que ya tenemos en el sistema: --bg, --surface, --sidebar, --panel-bg, --accent, --accent-light, --accent-deep, --text, --text-2, --subtext, --mute, --border. Pensé cada tema con un concepto, un par tipográfico sugerido y un uso para gráficos.

1. Disco 90s — neón sobre violeta profundo
Concepto: club nocturno, vinilo iridiscente, electric grids. Oscuro pero saturado, con dos acentos vibrantes.

Fondo / superficie

--bg #0d0420 (violeta noche)
--sidebar #0a031a
--surface #1a0a35
--panel-bg #160830 con backdrop-blur
--border rgba(236, 72, 153, 0.18) (rosa fantasma)
Acentos

--accent #ec4899 (magenta hot pink)
--accent-light #f9a8d4
--accent-deep #be185d
Secundario sugerido: #22d3ee (cyan) — para gráficos secundarios y el gradiente de marca: linear-gradient(130deg, #ec4899, #22d3ee)
Texto

Títulos / --text: #fbeaff (lavanda muy clara, casi blanca)
Body / --text-2: #dcc6f0
--subtext: #9b7fb8
--mute: #6b4d8a
Tipografía sugerida: Playfair Display Italic (titulares — ya está), body en Space Grotesk (más geométrico que Sora, va con el tono).

2. Arcoíris — gris neutro + acento que rota por módulo
Concepto: base sobria, color como signal. Cada módulo "trae" su color. Buen balance entre minimalismo y juego.

Fondo / superficie

--bg #f7f6f4 (off-white cálido)
--sidebar #ffffff
--surface #efedea
--panel-bg #ffffff
--border rgba(20, 20, 20, 0.08)
Acento — el acento cambia por módulo (lo que hace al tema "arcoíris"):

Bóveda → --accent: #7c3aed (violeta)
Hábitos → --accent: #059669 (verde)
Agenda → --accent: #2563eb (azul)
Finanzas → --accent: #d97706 (ámbar)
--accent-light y --accent-deep se derivan: −10% / +12% de luminancia
Gradiente neutro de marca: linear-gradient(130deg, #7c3aed, #ec4899, #f59e0b) solo en el logo "SGR"
Texto

Títulos / --text: #1a1714
Body / --text-2: #3f3a36
--subtext: #7a736c
--mute: #a8a29a
Tipografía sugerida: mantener Playfair + Sora.

3. Colores tierra — terracota sobre arcilla
Concepto: cerámica, café tostado, papel reciclado. Oscuro cálido y orgánico.

Fondo / superficie

--bg #1c1410 (café muy oscuro, casi negro)
--sidebar #15100c
--surface #2a1f18
--panel-bg #241a14
--border rgba(193, 134, 89, 0.14)
Acentos

--accent #c87f3e (terracota)
--accent-light #e0a878
--accent-deep #9c5e26
Secundario sugerido: #7c8b5e (verde oliva apagado) para gráficos
Texto

Títulos / --text: #f5ead8 (pergamino)
Body / --text-2: #d9c5a8
--subtext: #9a8770
--mute: #6b5d4d
Tipografía sugerida: Playfair Display para títulos (queda hermoso), IBM Plex Sans o Fraunces en body si querés llevarlo más editorial.

4. Colores pasteles — light mode lavanda
Concepto: papel, post-it, sticker book. Suave, alta legibilidad, contraste sutil.

Fondo / superficie

--bg #fbf7ff (lavanda muy clara)
--sidebar #f4edff
--surface #eee5ff
--panel-bg #ffffff
--border rgba(91, 70, 145, 0.12)
Acentos

--accent #a78bfa (lavanda)
--accent-light #c4b5fd
--accent-deep #7c3aed
Branch colors pastel para gráficos: #fbcfe8, #bae6fd, #bbf7d0, #fde68a, #fecaca, #ddd6fe, #fed7aa, #a7f3d0, #f5d0fe, #fecdd3
Texto

Títulos / --text: #2a1f4a (índigo oscuro — no negro, para que case con el tono)
Body / --text-2: #4a3e6e
--subtext: #7c7194
--mute: #a59cba
Tipografía sugerida: Playfair + Sora — y considerá bajar el font-weight general (300/400) porque los pasteles necesitan trazos más delicados.

5. Lima y gris — minimalismo high-contrast
Concepto: hoja de cálculo de diseñador, Linear-style, signal sobre grayscale puro. Mi favorita para uso diario denso.

Fondo / superficie

--bg #0e0f10 (carbón puro, frío)
--sidebar #08090a
--surface #17191c
--panel-bg #141518
--border rgba(255, 255, 255, 0.07)
Acentos

--accent #bef264 (lima)
--accent-light #d9f99d
--accent-deep #84cc16
Sin secundario — la fuerza del tema está en mantener todo gris excepto los CTAs/datos críticos en lima. Los gráficos usan escala de grises + lima para el valor "vivo" (mes actual, hábito de hoy).
Texto

Títulos / --text: #f4f5f7
Body / --text-2: #c9cbd0
--subtext: #7a7d84
--mute: #4d5057
Tipografía sugerida: Sora en todo — Playfair se ve raro acá. Cambiá la marca "SGR" a Sora 700 o Geist Mono para reforzar el tono técnico.

6. Arena y negro — desértico, alto contraste cálido
Concepto: papel kraft sobre negro tinta. Editorial pero más rústico que "negro y oro" — menos lujo, más textura.

Fondo / superficie

--bg #0c0a08 (negro tinta)
--sidebar #070605
--surface #1c1814
--panel-bg #171410
--border rgba(232, 211, 178, 0.12)
Acentos

--accent #e8d3b2 (arena)
--accent-light #f5e9d2
--accent-deep #c2a87d
Para datos críticos (rojo/verde de finanzas), usar versiones desaturadas: #a85a3a (terracota) y #7d8a5c (musgo) — no rojo/verde estándar, romperían el tono.
Texto

Títulos / --text: #e8d3b2 (la arena es a la vez acento Y color de títulos — es la marca del tema)
Body / --text-2: #c4b394
--subtext: #8a7d65
--mute: #5a5142
Tipografía sugerida: Fraunces o Playfair Italic para titulares + Sora para body. Este tema pide más serif que los demás.

Notas generales:

Para los temas claros (Arcoíris, Pasteles) vas a tener que invertir lógica de box-shadow: usar sombras más opacas en negro en vez de glows de acento, porque sobre fondo claro los glows desaparecen.
En Disco 90s y Negro y oro podés permitirte gradientes más fuertes en CTAs y headers de cards — los otros temas piden moderación.
Lima y gris y Arena y negro funcionan mejor con tipografía monoespaciada en datos numéricos. Ya usás JetBrains Mono — perfecto.
Si querés validar contraste WCAG: todas las combinaciones --text sobre --bg están por encima de 9:1 (AAA). --subtext sobre --bg queda en 4.5:1 (AA normal). Las únicas dudosas son los acentos sobre fondo claro en Pasteles — para CTAs sobre lavanda usá --accent-deep (#7c3aed) en vez de --accent.

## Seguimos

[✅] Dentro de ClaudeDesign cuando apretas "+ Captura" se abre un cuadro flotante. Me gusta más que una ventana nueva. Me gustaría que repliquemos eso. Me gustaría que arriba del título, haya en fila 4 botones Bóveda/Finanzas/Agenda/Hábitos. Por ahora solo funciona la de bóveda. El título me gusta. El cuadro me gusta. Me gusta que autodetecte y marque si es texto, link o foto y que se pueda seleccionar manual por si no detecta algo bien. Me gusta la seccion de categoria con su desplegable. Me gusta lo de recordar pero por ahora que no se pueda usar. Que aparezca pero que no se pueda usar. Me gusta que se pueda guardar con "CNTRL + ENTER".

## Tipografías

1. Sobrio
Títulos / impacto: Playfair Display Italic (serif transicional, alto contraste, terminales agudas)
Body: Sora (geométrica humanista, sutiles curvas redondeadas)

2. Cuaderno
Títulos / marca: Caveat (handwritten cursivo, Google Fonts)
Body: Comic Sans MS (humanist sans, redondeada, sistema)

3. Terminal
Títulos / marca: JetBrains Mono Bold (monospace, tracking ajustado en bold)
Body: IBM Plex Sans (humanist sans con quirks — la 'g' de dos pisos, las terminales rectas)

4. Cálido
Títulos / marca: DM Serif Display (serif transicional moderno, grandes curvas, peso fijo regular)
Body: Manrope (geo sans humanista, redondeada, hecha por Mikhail Sharanda)

5. Neo-grotesque
Títulos / marca: Space Grotesk (neo-grotesque con personalidad — 'g' redonda inusual, números con flair)
Body: DM Sans (neo-grotesque calma, casi neutral)

6. Playful
Títulos / marca: Bricolage Grotesque (display variable de Mathieu Triay — anchos opticos, juega con grade)
Body: Outfit (geo sans limpia, casi cuadrada)