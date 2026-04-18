export const TRANSLATIONS = {
  es: {
    browse: 'Explorar', capture: 'Nueva hoja', settings: 'Ajustes',
    categories: 'Categorías', newCategory: '+ Nueva categoría', trophies: 'Trofeos',
    searchPlaceholder: 'Buscar en todo el conocimiento...', noHojas: 'No hay hojas — usá el + para agregar.', noResults: 'Sin resultados.',
    knowledgeGraph: 'Red de conocimiento',
    newNote: 'Nueva hoja', pasteHere: 'Pegá un link, texto, cita...', linkDetected: '🔗 Link detectado', textType: '📝 Texto',
    save: 'Guardar', saving: 'Guardando...', saved: 'Guardado ✓',
    notes: 'Apuntes', confirmDelete: 'Confirmar', deleted: 'Hoja eliminada', saveNotes: 'Guardar', notesSaved: 'Apuntes guardados',
    colorTheme: 'Tema de color', language: 'Idioma',
    searchOrCreate: 'Buscar o crear...', chooseCategory: 'Elegí una categoría...', create: 'Crear', creating: 'Creando...',
    clickNodeHint: 'Hacé clic en un nodo para ver el detalle',
    latestLeaves: 'Últimas hojas', yourName: 'Tu nombre', namePlaceholder: 'Cómo te llama el grafo...',
    openPanel: 'Abrir panel', closePanel: 'Cerrar',
    apuntes: 'Apuntes', noApuntes: 'Sin apuntes todavía...',
    back: '← Volver',
  },
  en: {
    browse: 'Browse', capture: 'New note', settings: 'Settings',
    categories: 'Categories', newCategory: '+ New category', trophies: 'Trophies',
    searchPlaceholder: 'Search all knowledge...', noHojas: 'No notes yet — use + to add one.', noResults: 'No results.',
    knowledgeGraph: 'Knowledge graph',
    newNote: 'New note', pasteHere: 'Paste a link, text, quote...', linkDetected: '🔗 Link detected', textType: '📝 Text',
    save: 'Save', saving: 'Saving...', saved: 'Saved ✓',
    notes: 'Notes', confirmDelete: 'Confirm', deleted: 'Note deleted', saveNotes: 'Save', notesSaved: 'Notes saved',
    colorTheme: 'Color theme', language: 'Language',
    searchOrCreate: 'Search or create...', chooseCategory: 'Choose a category...', create: 'Create', creating: 'Creating...',
    clickNodeHint: 'Click a node to see details',
    latestLeaves: 'Latest leaves', yourName: 'Your name', namePlaceholder: 'How the graph calls you...',
    openPanel: 'Open panel', closePanel: 'Close',
    apuntes: 'Notes', noApuntes: 'No notes yet...',
    back: '← Back',
  },
}

export function t(lang, key) {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.es[key] ?? key
}
