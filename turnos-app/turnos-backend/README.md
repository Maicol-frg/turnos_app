# Turnos — Backend

API para la app de reservas de estilistas independientes.

## Instalar y correr

```bash
cd turnos-backend
npm install
cp .env.example .env      # pon tu STRIPE_SECRET_KEY de prueba
npm start                 # http://localhost:4000
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/estilistas` | Lista todas las estilistas y sus servicios |
| GET | `/api/estilistas/:id/disponibilidad?dia=2026-09-28` | Horas libres/ocupadas de ese día |
| POST | `/api/turnos` | Crea un turno en estado `pendiente_pago` |
| GET | `/api/turnos?estilistaId=s1` | Turnos de una estilista |
| PATCH | `/api/turnos/:id` | Cambia estado: `confirmado`, `completado`, `cancelado` |
| POST | `/api/pagos/crear-intento` | Crea el cobro en Stripe, devuelve `clientSecret` |
| POST | `/api/pagos/webhook` | Stripe confirma el pago → turno pasa a `confirmado` |

## Flujo real de reserva + pago

1. Cliente elige estilista, servicio y hora → frontend llama `POST /api/turnos` (queda `pendiente_pago`).
2. Frontend llama `POST /api/pagos/crear-intento` con el `turnoId` → recibe `clientSecret`.
3. Frontend usa **Stripe.js** (`stripe.confirmCardPayment(clientSecret, ...)`) para cobrar la tarjeta directamente desde el navegador del cliente — la tarjeta nunca toca tu servidor.
4. Stripe notifica el resultado a `/api/pagos/webhook` → el turno pasa a `confirmado`.

## Base de datos

Usa **SQLite** vía `better-sqlite3`: no necesitas instalar ni levantar un servidor de base de datos aparte, todo vive en el archivo `src/data/turnos.db`, que se crea y se siembra con datos de ejemplo automáticamente la primera vez que corres `npm start`. Si borras ese archivo, vuelve a sembrarse desde cero.

## Siguientes pasos sugeridos

- Migrar de SQLite a Postgres (con Prisma o Knex) cuando el negocio crezca y necesites varios servidores o backups gestionados — el código de los controladores cambia poco porque las consultas ya están centralizadas.
- Añadir autenticación (JWT) para que cada estilista solo vea y edite sus propios turnos.
- Validar la firma del webhook de Stripe con `stripe.webhooks.constructEvent` (aquí está simplificado).
- Enviar confirmación/recordatorio por WhatsApp o email al crear y 24h antes del turno.
