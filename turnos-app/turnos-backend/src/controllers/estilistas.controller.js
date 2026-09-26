const db = require('../db');

const HORAS_BASE = ['9:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00'];

function conServicios(estilista) {
  const servicios = db.prepare('SELECT id, nombre, precio, duracion_min AS duracionMin FROM servicios WHERE estilista_id = ?')
    .all(estilista.id);
  return { ...estilista, servicios };
}

function listar(req, res) {
  const estilistas = db.prepare('SELECT id, nombre, especialidad, hora_inicio AS horaInicio, hora_fin AS horaFin FROM estilistas').all();
  res.json(estilistas.map(conServicios));
}

function obtenerUno(req, res) {
  const estilista = db.prepare('SELECT id, nombre, especialidad, hora_inicio AS horaInicio, hora_fin AS horaFin FROM estilistas WHERE id = ?')
    .get(req.params.id);
  if (!estilista) return res.status(404).json({ error: 'Estilista no encontrada' });
  res.json(conServicios(estilista));
}

// GET /api/estilistas/:id/disponibilidad?dia=2026-09-28
function disponibilidad(req, res) {
  const { dia } = req.query;
  if (!dia) return res.status(400).json({ error: 'Debes indicar el parámetro "dia" (YYYY-MM-DD)' });

  const estilista = db.prepare('SELECT id FROM estilistas WHERE id = ?').get(req.params.id);
  if (!estilista) return res.status(404).json({ error: 'Estilista no encontrada' });

  const ocupadas = db.prepare(
    `SELECT hora FROM turnos WHERE estilista_id = ? AND dia = ? AND estado != 'cancelado'`
  ).all(estilista.id, dia).map(r => r.hora);

  const horas = HORAS_BASE.map(hora => ({ hora, libre: !ocupadas.includes(hora) }));
  res.json({ estilistaId: estilista.id, dia, horas });
}

module.exports = { listar, obtenerUno, disponibilidad };
