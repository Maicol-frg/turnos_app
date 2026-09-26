require('dotenv').config();
const express = require('express');
const cors = require('cors');

const estilistasRoutes = require('./routes/estilistas.routes');
const turnosRoutes = require('./routes/turnos.routes');
const pagosRoutes = require('./routes/pagos.routes');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/estilistas', estilistasRoutes);
app.use('/api/turnos', turnosRoutes);
app.use('/api/pagos', pagosRoutes);

app.get('/', (req, res) => res.json({ ok: true, servicio: 'turnos-backend' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Turnos API corriendo en http://localhost:${PORT}`));
