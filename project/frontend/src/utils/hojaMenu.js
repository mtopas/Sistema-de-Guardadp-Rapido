import { t } from './i18n'

// Ítems del menú contextual (clic derecho) de una hoja de la Bóveda.
// Se comparte entre el árbol (LeftPanel), el workspace (BovedaWorkspace) y
// "Últimas hojas" (RightPanel) para no duplicar el menú en cada lugar.
// - onOpen: abre la hoja en el editor completo (navega a /hoja/:id).
// - onEdit: abre el modal de edición rápida.
// - onDelete: abre el modal de confirmación de borrado.
export function buildHojaContextItems(hoja, { lang, onOpen, onEdit, onDelete }) {
  return [
    { label: t(lang, 'bovedaMenuOpen'), onClick: () => onOpen?.(hoja) },
    { label: t(lang, 'bovedaMenuEdit'), onClick: () => onEdit?.(hoja) },
    { label: t(lang, 'bovedaMenuDelete'), danger: true, onClick: () => onDelete?.(hoja) },
  ]
}
