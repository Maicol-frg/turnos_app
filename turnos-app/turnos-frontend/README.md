# Turnos — Frontend

Prototipo responsive/PWA que ahora se conecta al backend real (`turnos-backend`) en vez de guardar todo en el navegador.

## Cómo probarlo

1. Levanta el backend primero (ver `turnos-backend/README.md`): `npm install && npm start` → queda en `http://localhost:4000`.
2. Abre `index.html` en el navegador (doble clic, o sirviéndolo con cualquier servidor estático, ej. `npx serve .`).
3. Si tu backend corre en otra URL, cambia la constante `API_BASE` al inicio del `<script>` en `index.html`.

## Qué cambió respecto al prototipo original

- La lista de estilistas y servicios ya no está "quemada" en el código: se pide a `GET /api/estilistas`.
- Los horarios disponibles se calculan en el servidor (`GET /api/estilistas/:id/disponibilidad`), así dos personas nunca pueden reservar la misma hora.
- Reservar un turno hace `POST /api/turnos` y luego `POST /api/pagos/crear-intento` (Stripe en modo test).
- El panel de la estilista lee y actualiza los turnos con `GET`/`PATCH /api/turnos`.

## Pendiente para producción

- Reemplazar el formulario de tarjeta por **Stripe Elements** real: hoy el pago se confirma directo tras crear el intento, sin cobrar la tarjeta de verdad.
- Servir este `index.html` desde un dominio con HTTPS y agregar `manifest.json` + `service-worker.js` propios para que sea instalable como PWA.
- Login real de la estilista (hoy es solo un selector, sin contraseña).
