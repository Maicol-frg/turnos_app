require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db'); // fuerza la creación/migración de las tablas al arrancar

const horariosRoutes = require('./routes/horarios.routes');
const turnosRoutes = require('./routes/turnos.routes');
const ownerRoutes = require('./routes/owner.routes');
const serviciosRoutes = require('./routes/servicios.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));

app.use(express.json());

app.use('/api/horarios', horariosRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/servicios', serviciosRoutes);

app.get('/', (req, res) => res.json({ ok: true, servicio: 'beatifull-nails-backend' }));

// ---------- Tareas de mantenimiento en segundo plano ----------
const turnosService = require('./services/turnosService');

// Cada minuto también: revisa a quién avisarle que se acerca su turno.
setInterval(() => turnosService.verificarYNotificar(), 60 * 1000);

// Una vez al día: borra turnos de fechas de hace más de una semana.
setInterval(() => turnosService.limpiarAntiguos(), 24 * 60 * 60 * 1000);
turnosService.limpiarAntiguos();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Beatifull Nails API corriendo en http://localhost:${PORT}`));
