# Agenda SGR

Frontend independiente para la API de Agenda de SGR.

## Uso

1. Iniciá el backend de SGR en `http://127.0.0.1:8765`.
2. Desde esta carpeta ejecutá `npm install` y `npm run dev`.
3. Abrí `http://127.0.0.1:5174`.

Para otro puerto de backend, definí `SGR_API_URL` antes de iniciar Vite. Las solicitudes `/agenda/*` se redirigen al backend, sin datos de demostración ni almacenamiento paralelo.

Incluye calendario mensual y semanal, eventos, tareas y listas, horarios de facultad, revisión semanal, búsqueda, categorías y exportación ICS. Los cambios se guardan en la API existente.
