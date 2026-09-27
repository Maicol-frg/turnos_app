# Beatifull Nails — sistema de turnos

Sistema web para gestionar turnos, horarios, servicios, cobro (en línea o
efectivo) y administración del salón.

La estructura y responsabilidades del proyecto están documentadas en
`docs/ARCHITECTURE.md`.

## Cómo probarlo en tu computador

1. Entra a `backend/`, sigue su propio README (`npm install`, copiar
   `.env.example` a `.env`, `npm start`). Queda corriendo en
   `http://localhost:4000`.
2. Abre `index.html` en el navegador (o sírvelo con `npx serve .`).
3. Si el backend corre en otra URL, cambia `API_BASE` en `js/config.js`.
