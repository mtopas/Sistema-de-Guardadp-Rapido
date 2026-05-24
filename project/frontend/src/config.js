export const DEBUG = import.meta.env.DEV
// Dev: Vite :5173 → API :8000. Build/producción/.exe: mismo origen (vacío = relativo).
export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://127.0.0.1:8000')
