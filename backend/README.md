# Beatifull Nails — Backend

API de turnos, horarios y pagos. Reemplaza al backend anterior en Google
Apps Script (`Code.gs`); la lógica de negocio es la misma (fila por día,
horarios exactos u opcionales, modo dueño), pero ahora corre en un servidor
propio con una base de datos real.

## Instalar y correr

```bash
cd turnos-backend    # o la carpeta donde hayas puesto backend/
npm install
cp .env.example .env      # define OWNER_PIN, JWT_SECRET y claves de Stripe
npm start                 # http://localhost:4000
```

Antes de probar pagos, reemplaza en `.env` los valores de ejemplo de
`STRIPE_SECRET_KEY` (`sk_test_...`) y `STRIPE_PUBLISHABLE_KEY` (`pk_test_...`)
por claves de prueba de tu cuenta Stripe. No pongas claves `sk_` en el
frontend ni las compartas. Para pagos locales también necesitas
`STRIPE_WEBHOOK_SECRET` (`whsec_...`) generado por `stripe listen`.

La base de datos (`src/data/beatifull-nails.db`) se crea sola la primera
vez, con el horario semanal por defecto ya cargado.

## Endpoints principales

| Método | Ruta | Quién puede | Qué hace |
|---|---|---|---|
| GET | `/api/horarios/dias?cantidad=10` | público | Próximos N días con abierto/cerrado |
| GET | `/api/horarios/semanal` | público | Horario habitual de cada día de la semana |
| GET | `/api/horarios/:fecha` | público | Disponibilidad completa de un día (cupos u horas exactas) |
| PUT | `/api/horarios/semanal` | dueña | Actualiza el horario semanal |
| PUT/DELETE | `/api/horarios/:fecha/cierre` | dueña | Cierra/reabre una fecha puntual |
| PUT | `/api/horarios/:fecha/configuracion` | dueña | Capacidad, minutos por cliente u horarios exactos de una fecha |
| GET | `/api/servicios` | público | Catálogo con precios |
| POST | `/api/turnos` | público | Crea un turno (pago en línea o efectivo) |
| GET | `/api/turnos/:fecha` | público/dueña | Lista los turnos de un día (con más detalle si hay sesión de dueña) |
| PATCH | `/api/turnos/:id/aprobar` \| `/rechazar` | dueña | Aprueba o rechaza un turno pagado en efectivo |
| PATCH | `/api/turnos/:id/atendido` | dueña | Marca/desmarca como atendido |
| PATCH | `/api/turnos/:id/hora` | dueña | Reasigna la hora de un turno |
| DELETE | `/api/turnos/:id` \| `/dia/:fecha` | dueña | Elimina un turno o vacía un día |
| POST | `/api/pagos/crear-intento` | público | Crea el cobro en Stripe (pago en línea) |
| POST | `/api/pagos/webhook` | Stripe | Confirma el turno cuando el pago se completó de verdad |
| POST | `/api/owner/login` | público | PIN → token de sesión (2 horas) |

## Probar el pago en línea en tu computador

Stripe necesita poder avisarle a tu backend cuando un pago se completa
(el webhook), y `localhost` no es alcanzable desde internet. Para probarlo
en tu máquina:

```bash
stripe listen --forward-to localhost:4000/api/pagos/webhook --events payment_intent.succeeded
```

Eso te da un `whsec_...` de prueba — ponlo en `STRIPE_WEBHOOK_SECRET` en tu
`.env` mientras estés probando en local. Una vez que despliegues el backend
a internet, se crea un endpoint de webhook real desde el dashboard de
Stripe apuntando a tu URL pública, y ese te da el `whsec_...` definitivo.

## Flujo de pago

- **En línea**: el frontend usa Stripe Elements para recoger la tarjeta; el
  backend crea un PaymentIntent y el webhook cambia el turno de
  `pendiente_pago` a `confirmado` cuando Stripe confirma el pago. Usa claves
  `pk_test_...` y `sk_test_...` y una tarjeta de prueba mientras desarrollas.
  Las claves de prueba no cobran dinero real. Para aceptar pagos reales hay
  que completar la activación de la cuenta Stripe y configurar claves y
  webhook de modo activo en un backend desplegado con HTTPS.
- **Efectivo**: el turno se crea como `pendiente_aprobacion` (el horario
  queda reservado de una vez). La dueña lo aprueba o rechaza desde el panel;
  si lo rechaza, el horario queda libre para otra persona.

## Siguientes pasos sugeridos

Ver la sección "Pendientes conocidos" en `../docs/ARCHITECTURE.md`.
