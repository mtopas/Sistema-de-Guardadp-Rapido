export const VAULT_PROJECT_STATUS_COPY = {
  loading: {
    title: 'Cargando proyectos de la Bóveda…',
    detail: 'Leyendo Bóveda / 01 - Proyectos.',
  },
  available: {
    title: 'Notas activas en la Bóveda',
    detail: 'Son notas que siguen físicamente dentro de Bóveda / 01 - Proyectos.',
  },
  empty: {
    title: 'No hay proyectos en la Bóveda',
    detail: 'La sección 01 - Proyectos está disponible, pero no tiene notas activas.',
  },
  unavailable: {
    title: 'Fuente de proyectos no disponible',
    detail: 'Jarvis no pudo leer Bóveda / 01 - Proyectos en este momento.',
  },
  stale: {
    title: 'Dato desactualizado',
    detail: 'Se conserva la última lectura porque la actualización de la Bóveda falló.',
  },
}

export function getVaultProjectStatusCopy(status) {
  return VAULT_PROJECT_STATUS_COPY[status] || VAULT_PROJECT_STATUS_COPY.unavailable
}
