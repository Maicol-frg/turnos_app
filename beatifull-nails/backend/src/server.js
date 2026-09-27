require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db'); // fuerza la creación/migración de las tablas al arrancar

const horariosRoutes = require('./routes/horarios.routes');
const turnosRoutes = require('./routes/turnos.routes');
const pagosRoutes = require('./routes/pagos.routes');
const ownerRoutes = require('./routes/owner.routes');
const serviciosRoutes = require('./routes/servicios.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));

// El webhook de Stripe va ANTES de express.json(): Stripe firma el cuerpo
// crudo de la petición, así que si express.json() lo parsea primero, la
// verificación de la firma en pagos.controller.js siempre fallaría.
const pagosController = require('./controllers/pagos.controller');
app.post('/api/pagos/webhook', express.raw({ type: 'application/json' }), pagosController.webhook);

app.use(express.json());

app.use('/api/horarios', horariosRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/servicios', serviciosRoutes);

app.get('/', (req, res) => res.json({ ok: true, servicio: 'beatifull-nails-backend' }));

// ---------- Tareas de mantenimiento en segundo plano ----------
const turnosService = require('./services/turnosService');

// Cada minuto: libera horarios de turnos que eligieron pagar en línea y
// nunca completaron el pago (ver MINUTOS_EXPIRACION_PAGO en turnosService).
setInterval(() => turnosService.expirarPendientesDePago(), 60 * 1000);

// Cada minuto también: revisa a quién avisarle que se acerca su turno.
setInterval(() => turnosService.verificarYNotificar(), 60 * 1000);

// Una vez al día: borra turnos de fechas de hace más de una semana.
setInterval(() => turnosService.limpiarAntiguos(), 24 * 60 * 60 * 1000);
turnosService.expirarPendientesDePago();
turnosService.limpiarAntiguos();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Beatifull Nails API corriendo en http://localhost:${PORT}`));
