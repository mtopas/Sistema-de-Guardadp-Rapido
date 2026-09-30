import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import {
  Network,
  LayoutGrid,
  Plus,
  ArrowUpRight,
  Folder,
  FileText,
  Link,
  Image,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Maximize,
  MoveUpRight,
  Search,
  Sparkles,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Clock,
  ExternalLink,
} from "lucide-react";
import { useApp } from "./store";
import {
  Button,
  IconButton,
  Pill,
  Empty,
  SearchBox,
  EditActions,
  ErrorNotice,
  SectionTitle,
} from "./ui";
import { PALETTE, title, plain, safeURL, labelDate } from "./domain";
const typeIcon = { texto: FileText, link: Link, foto: Image };
export default function Boveda({ noteId, navigate }) {
  const app = useApp();
  const { db, setModal, mode } = app;
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [type, setType] = useState("all"),
    [view, setView] = useState("graph"),
    [selected, setSelected] = useState(noteId || null),
    [semantic, setSemantic] = useState(null),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    if (noteId) setSelected(noteId);
  }, [noteId]);
  const descendants = useMemo(() => {
    const ids = new Set([String(category)]);
    for (let i = 0; i < db.categorias.length; i++)
      for (const c of db.categorias)
        if (ids.has(String(c.padre_id))) ids.add(String(c.id));
    return ids;
  }, [category, db.categorias]);
  const notes = (semantic || db.hojas).filter(
    (n) =>
      (category === "all" || descendants.has(String(n.categoria_id))) &&
      (type === "all" || n.tipo === type) &&
      (!query ||
        semantic ||
        `${title(n)} ${plain(n.contenido)} ${plain(n.apuntes)}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const chosen = db.hojas.find((n) => String(n.id) === String(selected));
  const create = () =>
    setModal({
      type: "form",
      resource: "hojas",
      defaults: category === "all" ? {} : { categoria_id: category },
    });
  return (
    <div className="page boveda-page">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> TU SEGUNDA MENTE
          </div>
          <h1>
            Las ideas <em>se conectan.</em>
          </h1>
          <p>
            Un lugar para guardar lo que descubrís. Y descubrir lo que conectás.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={create}>
          Capturar una idea
        </Button>
      </div>
      <ErrorNotice keys={["categorias", "hojas"]} />
      <div className="vault-layout">
        <aside className="collection-panel">
          <div className="panel-label">
            MI BÓVEDA{" "}
            <IconButton
              icon={Plus}
              label="Crear colección"
              onClick={() => setModal({ type: "form", resource: "categorias" })}
            />
          </div>
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSemantic(null);
            }}
            placeholder="Buscar una idea…"
          />
          <button
            className={`collection-row ${category === "all" ? "active" : ""}`}
            onClick={() => setCategory("all")}
          >
            <Network size={18} />
            <span>Todo mi universo</span>
            <b>{db.hojas.length}</b>
          </button>
          <div className="small-label">COLECCIONES</div>
          <CategoryTree
            categories={db.categorias}
            notes={db.hojas}
            selected={category}
            select={setCategory}
          />
          {!db.categorias.length && (
            <p className="muted small">
              Organizá tu conocimiento en colecciones.
            </p>
          )}
          <button
            className="text-button"
            onClick={() => setModal({ type: "form", resource: "categorias" })}
          >
            <Plus size={15} />
            Nueva colección
          </button>
          <div className="collection-bottom">
            <div className="small-label">TIPO DE CONTENIDO</div>
            {[
              ["all", "Todos", Network],
              ["texto", "Notas", FileText],
              ["link", "Enlaces", Link],
              ["foto", "Imágenes", Image],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                className={`filter-row ${type === key ? "active" : ""}`}
                onClick={() => setType(key)}
              >
                <Icon size={15} />
                {label}
                {type === key && <span className="color-dot" />}
              </button>
            ))}
            <button
              className="text-button"
              onClick={() =>
                setModal({ type: "manager", resource: "categorias" })
              }
            >
              <SlidersHorizontal size={14} />
              Administrar colecciones
            </button>
            {mode === "api" && (
              <>
                <Button
                  icon={Sparkles}
                  disabled={!query || searching}
                  onClick={async () => {
                    setSearching(true);
                    try {
                      const result = await app.action(
                        `/hojas/buscar-semantico?q=${encodeURIComponent(query)}&top_k=30`,
                      );
                      const list = Array.isArray(result)
                        ? result
                        : result.results ||
                          result.resultados ||
                          result.hojas ||
                          [];
                      setSemantic(list.map((r) => r.hoja || r));
                    } catch {
                    } finally {
                      setSearching(false);
                    }
                  }}
                >
                  {searching ? "Buscando…" : "Búsqueda semántica"}
                </Button>
                <button
                  className="text-button"
                  onClick={() =>
                    app.action("/hojas/reindexar", "POST").catch(() => {})
                  }
                >
                  <RefreshCw size={13} />
                  Reindexar Bóveda
                </button>
              </>
            )}
          </div>
        </aside>
        <section className="vault-main">
          <div className="canvas-toolbar">
            <div className="inline">
              <span className="color-dot" />
              <strong>
                {category === "all"
                  ? "Mapa de conocimiento"
                  : db.categorias.find((c) => String(c.id) === String(category))
                      ?.nombre}
              </strong>
              <span className="count">{notes.length}</span>
            </div>
            <div className="segmented">
              <button
                aria-label="Vista de grafo"
                aria-pressed={view === "graph"}
                className={view === "graph" ? "active" : ""}
                onClick={() => setView("graph")}
              >
                <Network size={16} />
              </button>
              <button
                aria-label="Vista de tarjetas"
                aria-pressed={view === "grid"}
                className={view === "grid" ? "active" : ""}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          {view === "graph" ? (
            <KnowledgeGraph
              notes={notes}
              categories={db.categorias}
              selected={selected}
              onSelect={setSelected}
              onCategory={setCategory}
              onCreate={create}
            />
          ) : (
            <div className="note-grid">
              {notes.map((n, i) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  category={db.categorias.find(
                    (c) => String(c.id) === String(n.categoria_id),
                  )}
                  onClick={() => setSelected(n.id)}
                  index={i}
                />
              ))}
              {!notes.length && (
                <Empty
                  title={
                    query
                      ? "Ninguna idea coincide."
                      : "Tu próxima idea empieza acá."
                  }
                  text={
                    query
                      ? "Probá con otra búsqueda o colección."
                      : "Una nota, un enlace o una imagen. Capturala antes de que se escape."
                  }
                  action="Crear nota"
                  onAction={create}
                />
              )}
            </div>
          )}
          <div className="canvas-caption">
            <span>
              <span className="live-dot" />{" "}
              {semantic ? "RESULTADOS SEMÁNTICOS" : "CONOCIMIENTO EN EXPANSIÓN"}
            </span>
            <span>
              {db.categorias.length} colecciones · {notes.length} conexiones
            </span>
          </div>
        </section>
        <aside className="detail-panel">
          {chosen ? (
            <NoteDetail
              note={chosen}
              category={db.categorias.find(
                (c) => String(c.id) === String(chosen.categoria_id),
              )}
              onClose={() => {
                setSelected(null);
                if (noteId) navigate("/");
              }}
            />
          ) : (
            <>
              <div className="panel-label">
                A MANO <Sparkles size={16} />
              </div>
              <div className="inspiration-card">
                <span className="tiny-tag">MENOS RUIDO. MÁS IDEAS.</span>
                <div className="mini-orbit">
                  <i />
                  <i />
                  <span>✦</span>
                </div>
                <h3>
                  Tu próximo gran paso
                  <br />
                  empieza con una nota.
                </h3>
                <button onClick={create}>
                  Hacé espacio para una idea <ArrowUpRight size={18} />
                </button>
              </div>
              <SectionTitle
                title="Lo más reciente"
                eyebrow="VOLVÉ A CONECTAR"
              />
              {[...db.hojas]
                .sort((a, b) =>
                  String(b.actualizado_en || b.creado_en).localeCompare(
                    String(a.actualizado_en || a.creado_en),
                  ),
                )
                .slice(0, 5)
                .map((n, i) => {
                  const Icon = typeIcon[n.tipo] || FileText;
                  return (
                    <button
                      className="recent-note"
                      key={n.id}
                      onClick={() => setSelected(n.id)}
                    >
                      <span
                        className="note-icon"
                        style={{
                          color: PALETTE[i % 6],
                          background: `${PALETTE[i % 6]}15`,
                        }}
                      >
                        <Icon size={18} />
                      </span>
                      <span>
                        <strong>{title(n)}</strong>
                        <small>
                          {db.categorias.find(
                            (c) => String(c.id) === String(n.categoria_id),
                          )?.nombre || "Sin colección"}
                        </small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
              {!db.hojas.length && (
                <p className="muted small">Tus últimas notas aparecerán acá.</p>
              )}
              <div className="vault-tip">
                <span>↗</span>
                <p>
                  <strong>Capturá el momento.</strong>
                  <br />
                  Usá <kbd>N</kbd> para guardar una idea desde cualquier
                  sección.
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
function CategoryTree({
  categories,
  notes,
  selected,
  select,
  parent = null,
  depth = 0,
  visited = new Set(),
}) {
  if (depth > 8) return null;
  return categories
    .filter((c) =>
      parent == null ? !c.padre_id : String(c.padre_id) === String(parent),
    )
    .filter((c) => !visited.has(c.id))
    .map((c, i) => (
      <React.Fragment key={c.id}>
        <button
          className={`collection-row ${String(selected) === String(c.id) ? "active" : ""}`}
          style={{
            paddingLeft: 12 + depth * 14,
            "--collection": c.color || PALETTE[i % 6],
          }}
          onClick={() => select(c.id)}
        >
          <Folder size={17} />
          <span>{c.nombre}</span>
          <b>
            {
              notes.filter((n) => String(n.categoria_id) === String(c.id))
                .length
            }
          </b>
        </button>
        <CategoryTree
          categories={categories}
          notes={notes}
          selected={selected}
          select={select}
          parent={c.id}
          depth={depth + 1}
          visited={new Set([...visited, c.id])}
        />
      </React.Fragment>
    ));
}
function KnowledgeGraph({
  notes,
  categories,
  selected,
  onSelect,
  onCategory,
  onCreate,
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const groups = useMemo(() => {
    const used = categories.filter((c) =>
      notes.some((n) => String(n.categoria_id) === String(c.id)),
    );
    if (
      notes.some(
        (n) => !categories.some((c) => String(c.id) === String(n.categoria_id)),
      )
    )
      used.push({
        id: "uncategorized",
        nombre: "Sin colección",
        color: PALETTE[5],
      });
    return used.map((c, i) => {
      const angle = (i / Math.max(used.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        ...c,
        x: 400 + Math.cos(angle) * 222,
        y: 310 + Math.sin(angle) * 188,
        color: c.color || PALETTE[i % 6],
        notes: notes.filter((n) =>
          c.id === "uncategorized"
            ? !categories.some(
                (cat) => String(cat.id) === String(n.categoria_id),
              )
            : String(n.categoria_id) === String(c.id),
        ),
      };
    });
  }, [notes, categories]);
  return (
    <div className="graph-area">
      <svg
        className="knowledge-svg"
        viewBox="0 0 800 620"
        aria-label="Mapa interactivo de conocimiento"
        onPointerDown={(e) => {
          if (e.target.closest("[data-node]")) return;
          drag.current = { x: e.clientX, y: e.clientY, pan };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const ratio = 800 / e.currentTarget.getBoundingClientRect().width;
          setPan({
            x: drag.current.pan.x + (e.clientX - drag.current.x) * ratio,
            y: drag.current.pan.y + (e.clientY - drag.current.y) * ratio,
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <defs>
          <radialGradient id="graphGlow">
            <stop offset="0" stopColor="#a594ff" stopOpacity=".12" />
            <stop offset="1" stopColor="#a594ff" stopOpacity="0" />
          </radialGradient>
          <pattern
            id="graphDots"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="currentColor" opacity=".16" />
          </pattern>
        </defs>
        <rect width="800" height="620" fill="url(#graphDots)" />
        <circle cx="400" cy="310" r="290" fill="url(#graphGlow)" />
        <g
          transform={`translate(${400 + pan.x},${310 + pan.y}) scale(${zoom}) translate(-400,-310)`}
        >
          <g className="orbit-rings" fill="none">
            <ellipse cx="400" cy="310" rx="280" ry="245" />
            <ellipse cx="400" cy="310" rx="190" ry="169" />
            <circle cx="400" cy="310" r="100" />
          </g>
          {groups.map((g, gi) => (
            <g key={g.id}>
              <path
                className="graph-edge"
                d={`M400 310 Q ${400 + (g.x - 400) * 0.1} ${g.y} ${g.x} ${g.y}`}
                stroke={g.color}
              />
              {g.notes.slice(0, 12).map((n, i) => {
                const angle =
                  (i / Math.min(g.notes.length, 12)) * Math.PI * 2 + gi;
                const radius = 62 + (i % 2) * 18;
                const x = g.x + Math.cos(angle) * radius,
                  y = g.y + Math.sin(angle) * radius;
                return (
                  <g key={n.id}>
                    <line
                      className="graph-edge branch"
                      x1={g.x}
                      y1={g.y}
                      x2={x}
                      y2={y}
                      stroke={g.color}
                    />
                    <g
                      data-node="true"
                      className={`graph-leaf ${String(selected) === String(n.id) ? "selected" : ""}`}
                      role="button"
                      tabIndex="0"
                      aria-label={title(n)}
                      onClick={() => onSelect(n.id)}
                      onKeyDown={(e) => {
                        if (["Enter", " "].includes(e.key)) {
                          e.preventDefault();
                          onSelect(n.id);
                        }
                      }}
                    >
                      <title>{title(n)}</title>
                      <circle
                        cx={x}
                        cy={y}
                        r="18"
                        fill={g.color}
                        fillOpacity=".07"
                      />
                      <circle cx={x} cy={y} r="6" fill={g.color} />
                      <text x={x} y={y + 27} textAnchor="middle">
                        {title(n).length > 21
                          ? title(n).slice(0, 20) + "…"
                          : title(n)}
                      </text>
                    </g>
                  </g>
                );
              })}
              <g
                data-node="true"
                role="button"
                tabIndex="0"
                aria-label={`Filtrar ${g.nombre}`}
                className="graph-group"
                onClick={() =>
                  onCategory(g.id === "uncategorized" ? "all" : g.id)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    onCategory(g.id === "uncategorized" ? "all" : g.id);
                }}
              >
                <circle
                  cx={g.x}
                  cy={g.y}
                  r="29"
                  fill={g.color}
                  fillOpacity=".13"
                  stroke={g.color}
                  strokeOpacity=".55"
                />
                <text
                  className="group-symbol"
                  x={g.x}
                  y={g.y + 7}
                  fill={g.color}
                  textAnchor="middle"
                >
                  {["✧", "◎", "⌘", "✦", "◈", "⊕"][gi % 6]}
                </text>
                <rect
                  x={g.x - 83}
                  y={g.y + 35}
                  width="166"
                  height="28"
                  rx="9"
                  fill="var(--panel)"
                />
                <text
                  className="group-label"
                  x={g.x}
                  y={g.y + 53}
                  fill={g.color}
                  textAnchor="middle"
                >
                  {g.nombre.length > 23
                    ? g.nombre.slice(0, 22) + "…"
                    : g.nombre}
                  {g.notes.length > 12 ? ` +${g.notes.length - 12}` : ""}
                </text>
              </g>
            </g>
          ))}
          <g className="graph-core">
            <circle cx="400" cy="310" r="65" fill="var(--panel)" />
            <circle
              cx="400"
              cy="310"
              r="64"
              fill="none"
              stroke="var(--lime)"
              strokeOpacity=".28"
            />
            <circle
              cx="400"
              cy="310"
              r="52"
              fill="var(--lime)"
              fillOpacity=".05"
            />
            <text x="400" y="299" textAnchor="middle" className="core-title">
              SGR
            </text>
            <text x="400" y="324" textAnchor="middle" className="core-sub">
              MI UNIVERSO
            </text>
            <circle
              className="orbit-particle"
              cx="400"
              cy="246"
              r="4"
              fill="var(--lime)"
            />
          </g>
        </g>
      </svg>
      {!notes.length && (
        <div className="graph-empty">
          <span>Un universo de posibilidades.</span>
          <Button icon={Plus} onClick={onCreate}>
            Tu primera idea
          </Button>
        </div>
      )}
      <div className="graph-controls">
        <IconButton
          icon={ZoomOut}
          label="Alejar mapa"
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
        />
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton
          icon={ZoomIn}
          label="Acercar mapa"
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
        />
        <i />
        <IconButton
          icon={Maximize}
          label="Restablecer mapa"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        />
      </div>
      <span className="graph-instruction">
        Arrastrá para explorar · Tocá una idea para abrirla
      </span>
    </div>
  );
}
function NoteCard({ note, category, onClick, index }) {
  const Icon = typeIcon[note.tipo] || FileText;
  return (
    <button
      className="note-card"
      style={{
        "--note-color": category?.color || PALETTE[index % 6],
        animationDelay: `${Math.min(index, 8) * 40}ms`,
      }}
      onClick={onClick}
    >
      <div>
        <Icon size={20} />
        <ArrowUpRight size={17} />
      </div>
      <h3>{title(note)}</h3>
      <p>
        {plain(note.contenido).slice(0, 150) || "Una idea por desarrollar."}
      </p>
      <span>{category?.nombre || "Sin colección"}</span>
    </button>
  );
}
function NoteDetail({ note, category, onClose }) {
  const app = useApp();
  const Icon = typeIcon[note.tipo] || FileText;
  const url = note.tipo === "link" ? safeURL(note.contenido) : null;
  const imageURL =
    note.tipo === "foto"
      ? String(note.contenido).startsWith("data:image/")
        ? note.contenido
        : safeURL(
            note.contenido?.startsWith("/uploads/")
              ? app.base + note.contenido
              : note.contenido,
          )
      : null;
  return (
    <div className="note-detail">
      <div className="panel-label">
        <button className="text-button" onClick={onClose}>
          <ArrowLeft size={14} />
          Volver
        </button>
        <EditActions resource="hojas" item={note} />
      </div>
      <div
        className="detail-type"
        style={{ color: category?.color || PALETTE[1] }}
      >
        <Icon size={25} />
        <span>{note.tipo || "texto"}</span>
      </div>
      <h2>{title(note)}</h2>
      <Pill color={category?.color}>{category?.nombre || "Sin colección"}</Pill>
      {imageURL && (
        <img className="note-image" src={imageURL} alt={title(note)} />
      )}
      <div className="note-content">
        {note.tipo !== "foto" && plain(note.contenido)}
      </div>
      {url && (
        <a
          className="button"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir enlace <ExternalLink size={15} />
        </a>
      )}
      {note.apuntes && (
        <>
          <div className="small-label">APUNTES</div>
          <div
            className="note-content rich-preview"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(note.apuntes, {
                USE_PROFILES: { html: true },
              }),
            }}
          />
        </>
      )}
      <Button
        icon={FileText}
        onClick={() =>
          app.setModal({ type: "form", resource: "hojas", item: note })
        }
      >
        Editar contenido
      </Button>
      <div className="detail-date">
        <Clock size={13} />
        {note.creado_en
          ? labelDate(String(note.creado_en).slice(0, 10))
          : "Guardado en tu Bóveda"}
      </div>
    </div>
  );
}
