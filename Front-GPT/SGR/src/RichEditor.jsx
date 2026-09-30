import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link2,
  Undo,
  Redo,
  Check,
} from "lucide-react";
import { safeURL } from "./domain";
export default function RichEditor({ value, onChange, label = "Apuntes" }) {
  const [link, setLink] = useState(null),
    [error, setError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: "Dale forma a tu idea…" }),
    ],
    content: DOMPurify.sanitize(value || ""),
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML())
      editor.commands.setContent(DOMPurify.sanitize(value || ""), false);
  }, [value, editor]);
  if (!editor)
    return (
      <textarea
        aria-label={label}
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  const controls = [
    ["Negrita", Bold, () => editor.chain().focus().toggleBold().run(), "bold"],
    [
      "Cursiva",
      Italic,
      () => editor.chain().focus().toggleItalic().run(),
      "italic",
    ],
    [
      "Subtítulo",
      Heading2,
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      "heading",
    ],
    [
      "Lista",
      List,
      () => editor.chain().focus().toggleBulletList().run(),
      "bulletList",
    ],
    [
      "Lista numerada",
      ListOrdered,
      () => editor.chain().focus().toggleOrderedList().run(),
      "orderedList",
    ],
    [
      "Cita",
      Quote,
      () => editor.chain().focus().toggleBlockquote().run(),
      "blockquote",
    ],
    [
      "Insertar enlace",
      Link2,
      () => setLink(editor.getAttributes("link").href || ""),
      "link",
    ],
    ["Deshacer", Undo, () => editor.chain().focus().undo().run()],
    ["Rehacer", Redo, () => editor.chain().focus().redo().run()],
  ];
  return (
    <div className="rich-editor">
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Formato de apuntes"
      >
        {controls.map(([name, Icon, command, active]) => (
          <button
            type="button"
            key={name}
            aria-label={name}
            title={name}
            aria-pressed={active ? editor.isActive(active) : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={command}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>
      {link !== null && (
        <div className="editor-link">
          <input
            aria-label="Dirección del enlace"
            type="url"
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button
            type="button"
            aria-label="Aplicar enlace"
            onClick={() => {
              if (!link) {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .unsetLink()
                  .run();
                setLink(null);
                return;
              }
              const url = safeURL(link);
              if (!url || !/^https?:\/\//.test(link)) {
                setError("Ingresá un enlace HTTP o HTTPS.");
                return;
              }
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run();
              setLink(null);
              setError("");
            }}
          >
            <Check size={16} />
          </button>
        </div>
      )}
      {error && <small className="negative">{error}</small>}
      <EditorContent editor={editor} />
    </div>
  );
}
