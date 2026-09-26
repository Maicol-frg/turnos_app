const db = require('../db');

function crear(req, res) {
  const { estilistaId, servicioId, dia, hora, clienteNombre, clienteTelefono } = req.body;

  if (!estilistaId || !servicioId || !dia || !hora || !clienteNombre || !clienteTelefono) {
    return res.status(400).json({ error: 'Faltan datos obligatorios del turno' });
  }

  const servicio = db.prepare('SELECT id, precio FROM servicios WHERE id = ? AND estilista_id = ?')
    .get(servicioId, estilistaId);
  if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado para esa estilista' });

  const ocupado = db.prepare(
    `SELECT 1 FROM turnos WHERE estilista_id = ? AND dia = ? AND hora = ? AND estado != 'cancelado'`
  ).get(estilistaId, dia, hora);
  if (ocupado) return res.status(409).json({ error: 'Ese horario ya fue reservado' });

  const id = 't_' + Date.now();
  db.prepare(`
    INSERT INTO turnos (id, estilista_id, servicio_id, dia, hora, cliente_nombre, cliente_telefono, estado, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente_pago', ?)
  `).run(id, estilistaId, servicioId, dia, hora, clienteNombre, clienteTelefono, new Date().toISOString());

  res.status(201).json(obtenerTurnoCompleto(id));
}

function listar(req, res) {
  const { estilistaId } = req.query;
  const filas = estilistaId
    ? db.prepare('SELECT id FROM turnos WHERE estilista_id = ? ORDER BY dia, hora').all(estilistaId)
    : db.prepare('SELECT id FROM turnos ORDER BY dia, hora').all();
  res.json(filas.map(f => obtenerTurnoCompleto(f.id)));
}

function actualizarEstado(req, res) {
  const { estado } = req.body;
  const permitidos = ['confirmado', 'completado', 'cancelado'];
  if (!permitidos.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Usa uno de: ${permitidos.join(', ')}` });
  }

  const resultado = db.prepare('UPDATE turnos SET estado = ? WHERE id = ?').run(estado, req.params.id);
  if (resultado.changes === 0) return res.status(404).json({ error: 'Turno no encontrado' });

  res.json(obtenerTurnoCompleto(req.params.id));
}

// Devuelve el turno con nombre de estilista y servicio ya resueltos (evita otro join manual en cada ruta)
function obtenerTurnoCompleto(id) {
  return db.prepare(`
    SELECT
      t.id, t.estilista_id AS estilistaId, e.nombre AS estilistaNombre,
      s.nombre AS servicioNombre, s.precio AS precio,
      t.dia, t.hora, t.cliente_nombre AS clienteNombre, t.cliente_telefono AS clienteTelefono,
      t.estado, t.pago_id AS pagoId, t.creado_en AS creadoEn
    FROM turnos t
    JOIN estilistas e ON e.id = t.estilista_id
    JOIN servicios s ON s.id = t.servicio_id
    WHERE t.id = ?
  `).get(id);
}

module.exports = { crear, listar, actualizarEstado, obtenerTurnoCompleto };
