import { useCallback, useState } from 'react'
import { useStore } from '../../store/useStore'
import { t } from '../../utils/i18n'
import AgendaContextMenu from '../agenda/AgendaContextMenu'
import EditHabitoQuickModal from './EditHabitoQuickModal'
import DeleteHabitoModal from './DeleteHabitoModal'

export function useHabitoContextMenu({ selectedId, setSelectedId } = {}) {
  const lang = useStore(s => s.lang)
  const [contextMenu, setContextMenu] = useState(null)
  const [editHabito, setEditHabito] = useState(null)
  const [deleteHabito, setDeleteHabito] = useState(null)

  const openContextMenu = useCallback((e, habito) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, habito })
  }, [])

  const buildContextItems = useCallback((habito) => [
    {
      label: t(lang, 'habitosContextEdit'),
      onClick: () => setEditHabito(habito),
    },
    { separator: true },
    {
      label: t(lang, 'habitosEliminar'),
      danger: true,
      onClick: () => setDeleteHabito(habito),
    },
  ], [lang])

  const handleDeleted = useCallback(() => {
    if (deleteHabito?.id === selectedId) setSelectedId?.(null)
  }, [deleteHabito, selectedId, setSelectedId])

  const contextMenuLayer = (
    <>
      {contextMenu && (
        <AgendaContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems(contextMenu.habito)}
          onClose={() => setContextMenu(null)}
        />
      )}
      {editHabito && (
        <EditHabitoQuickModal habito={editHabito} onClose={() => setEditHabito(null)} />
      )}
      {deleteHabito && (
        <DeleteHabitoModal
          habito={deleteHabito}
          onClose={() => setDeleteHabito(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  )

  return { openContextMenu, contextMenuLayer }
}
