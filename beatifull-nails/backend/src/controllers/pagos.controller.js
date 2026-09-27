const Stripe = require('stripe');
const db = require('../db');
const turnosService = require('../services/turnosService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// GET /api/pagos/config
// El frontend pide acá la clave pública en vez de tenerla escrita en su
// propio código: si un día cambia de cuenta de Stripe, se edita solo el .env.
function config(req, res) {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '' });
}

// POST /api/pagos/crear-intento   body: { turnoId }
// Solo aplica a turnos con metodoPago = 'linea'; los de efectivo nunca
// pasan por acá, van directo al flujo de aprobación de la dueña.
async function crearIntento(req, res) {
  const { turnoId } = req.body;
  const turno = turnosService.obtenerTurnoCompleto(turnoId);
  if (!turno) return res.status(404).json({ error: 'no_encontrado', message: 'Turno no encontrado' });
  if (turno.metodoPago !== 'linea') {
    return res.status(400).json({ error: 'metodo_pago_invalido', message: 'Este turno no se paga en línea.' });
  }
  if (turno.estado !== 'pendiente_pago') {
    return res.status(400).json({ error: 'estado_invalido', message: 'Este turno no está pendiente de pago.' });
  }

  try {
    const intento = await stripe.paymentIntents.create({
      amount: turno.total * 100, // Stripe usa centavos
      currency: 'cop',
      metadata: { turnoId: turno.id }
    });
    db.prepare('UPDATE turnos SET pago_id = ? WHERE id = ?').run(intento.id, turno.id);
    res.json({ clientSecret: intento.client_secret });
  } catch (err) {
    res.status(502).json({ error: 'stripe_error', message: 'No se pudo crear el intento de pago', detalle: err.message });
  }
}

// POST /api/pagos/webhook
// Stripe avisa acá cuando el pago se confirma de verdad; recién ahí el
// turno pasa a "confirmado". La firma se valida contra STRIPE_WEBHOOK_SECRET
// para asegurarnos de que el aviso viene realmente de Stripe y no de
// cualquiera que le pegue a esta URL. Esta ruta se monta con el body crudo
// (sin parsear como JSON) — ver server.js.
async function webhook(req, res) {
  const firma = req.headers['stripe-signature'];
  let evento;
  try {
    evento = stripe.webhooks.constructEvent(req.body, firma, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Firma de webhook inválida: ${err.message}`);
  }

  if (evento.type === 'payment_intent.succeeded') {
    const pagoId = evento.data.object.id;
    const fila = db.prepare('SELECT id FROM turnos WHERE pago_id = ?').get(pagoId);
    if (fila) turnosService.confirmarPagoEnLinea(fila.id);
  }

  res.json({ recibido: true });
}

module.exports = { config, crearIntento, webhook };
