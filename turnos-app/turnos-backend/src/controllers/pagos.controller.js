const Stripe = require('stripe');
const db = require('../db');
const { obtenerTurnoCompleto } = require('./turnos.controller');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// POST /api/pagos/crear-intento   body: { turnoId }
async function crearIntento(req, res) {
  const { turnoId } = req.body;
  const turno = obtenerTurnoCompleto(turnoId);
  if (!turno) return res.status(404).json({ error: 'Turno no encontrado' });
  if (turno.estado !== 'pendiente_pago') {
    return res.status(400).json({ error: 'Este turno no está pendiente de pago' });
  }

  try {
    const intento = await stripe.paymentIntents.create({
      amount: turno.precio * 100, // Stripe usa centavos
      currency: 'cop',
      metadata: { turnoId: turno.id, estilistaId: turno.estilistaId }
    });

    db.prepare('UPDATE turnos SET pago_id = ? WHERE id = ?').run(intento.id, turno.id);
    res.json({ clientSecret: intento.client_secret });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo crear el intento de pago', detalle: err.message });
  }
}

// POST /api/pagos/webhook
async function webhook(req, res) {
  const evento = req.body; // en producción: validar firma con stripe.webhooks.constructEvent

  if (evento.type === 'payment_intent.succeeded') {
    const pagoId = evento.data.object.id;
    db.prepare(`UPDATE turnos SET estado = 'confirmado' WHERE pago_id = ?`).run(pagoId);
  }

  res.json({ recibido: true });
}

module.exports = { crearIntento, webhook };
