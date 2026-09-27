# Beatifull Nails — estructura del proyecto

## Objetivo

Mismo espíritu que la versión anterior: proyecto sencillo, sin frameworks
innecesarios, con responsabilidades separadas por archivo. Lo que cambió es
que el backend pasó de Google Apps Script a un servidor propio (Node +
Express + SQLite), lo que permitió resolver el punto de sincronización que
esta misma documentación señalaba como pendiente, y sumar cobro en línea.

## Estructura

```text
beatifull-nails/
├── index.html                       # Estructura y contenido de la interfaz
├── css/
│   └── style.css                    # Presentación visual
├── js/
│   ├── config.js                    # Configuración propia del navegador (ya no el catálogo ni el horario)
│   ├── api.js                       # Toda la comunicación con el backend, en un solo lugar
│   └── app.js                       # Estado de la interfaz, eventos y renderizado
├── img/                             # Recursos gráficos
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js                # Arranca Express y conecta las rutas
│       ├── db.js                    # Conexión SQLite + esquema + semilla
│       ├── config/
│       │   └── servicios.js         # Catálogo de servicios (única fuente de verdad de precios)
│       ├── routes/                  # Qué URL existe (sin lógica adentro)
│       ├── controllers/             # Traducen la petición HTTP a llamadas al service
│       ├── services/                # Lógica de negocio pura (fila, turnos)
│       └── middleware/              # Verificación de sesión de la dueña
├── docs/
│   └── ARCHITECTURE.md
└── OneSignalSDKWorker.js            # Debe permanecer en la raíz
```

## Responsabilidades

- `index.html`: elementos de la interfaz, formularios, modales y textos.
- `css/style.css`: colores, tipografía, distribución, responsive y animaciones.
- `js/config.js`: lo que sigue siendo propio de este navegador (seguimiento
  de "mi turno", token de sesión) y constantes de formato (meses, días).
- `js/api.js`: cada función corresponde a un endpoint del backend. `app.js`
  nunca llama a `fetch()` directamente.
- `js/app.js`: estado de la interfaz, eventos y renderizado.
- `backend/src/routes` → `controllers` → `services`: separación clásica de
  tres capas. Las rutas declaran qué URL existe, los controladores traducen
  petición↔respuesta, y los services tienen la lógica de negocio "pura" sin
  saber nada de Express — así se puede probar o reutilizar sin un servidor
  HTTP de por medio.
- `backend/src/config/servicios.js`: catálogo con precios. Es la única
  fuente de verdad: el frontend lo pide por API en vez de tenerlo escrito,
  así el precio que se cobra nunca depende de lo que mande el navegador.

## Criterios aplicados

1. Se evita duplicar datos de configuración dentro de la lógica (por eso el
   catálogo de servicios y los horarios se piden al backend en vez de
   repetirse en el frontend).
2. Se mantienen funciones pequeñas cuando la separación aporta claridad.
3. No se agregan clases, frameworks ni patrones de diseño sin necesidad real.
4. La interfaz y su estética existente se conservan.
5. Las modificaciones futuras deben respetar esta separación.

## Punto de sincronización — resuelto

El cierre de un día, la capacidad, los minutos por cliente y los horarios
exactos ya no viven en `localStorage`: todo se guarda en el backend
(`cierres_fecha`, `configuracion_dia`, `horarios_exactos`), así que cualquier
dispositivo que abra la página ve exactamente el mismo estado.

## Resuelto en esta vuelta

- **Horarios exactos como plantilla semanal**: ya se puede guardar "todos
  los martes a estas horas" (`horarios_exactos_semanal`) o una excepción
  puntual para una sola fecha, igual que el backend anterior.
- **Limpieza automática de días viejos**: corre sola una vez al día, y el
  botón "Limpiar ahora" del historial también funciona.
- **Notificaciones push reales**: `verificarYNotificar()` corre cada minuto
  y le avisa a quien tenga hora exacta a menos de 15 minutos, o a quien le
  falten 2 personas o menos en modo capacidad.
- **Turnos "pendiente de pago" abandonados**: se cancelan solos a los 15
  minutos si nadie completó el pago, liberando el horario.
- **Pago en línea real**: el formulario de tarjeta ahora es Stripe Elements
  de verdad (no una simulación), y el webhook valida la firma de Stripe
  antes de confirmar un turno.

## Pendientes conocidos

- **Recibir el webhook de Stripe en desarrollo local**: Stripe necesita
  poder golpear tu backend desde internet. Localmente se prueba con
  `stripe listen --forward-to localhost:4000/api/pagos/webhook` (Stripe
  CLI); una vez desplegado, se usa la URL pública del servidor.
- **OneSignal**: hace falta la `ONESIGNAL_REST_API_KEY` (Settings → Keys &
  Ids en el panel de OneSignal) en el `.env` del backend para que los push
  realmente salgan; sin ella, `verificarYNotificar()` simplemente no envía
  nada (no rompe la app).

