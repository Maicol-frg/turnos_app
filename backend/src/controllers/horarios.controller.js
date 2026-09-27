const db = require('../db');
const cola = require('../services/colaService');

function claveFecha(d) {
  return d.toISOString().slice(0, 10);
}

// GET /api/horarios/dias?cantidad=10&desde=2026-10-01
// Arma de una sola vez N fechas seguidas con su estado abierto/cerrado.
// Sin "desde", empieza hoy (lo usan las pestañas de día); con "desde", el
// calendario completo lo usa para pintar abierto/cerrado de cualquier mes,
// incluidos meses pasados que la dueña puede querer consultar.
function listarProximosDias(req, res) {
  const cantidad = Math.min(parseInt(req.query.cantidad, 10) || 10, 31);
  const base = req.query.desde ? new Date(req.query.desde + 'T00:00:00') : new Date();
  base.setHours(0, 0, 0, 0);

  const dias = [];
  for (let i = 0; i < cantidad; i++) {
    const fecha = new Date(base);
    fecha.setDate(fecha.getDate() + i);
    const clave = claveFecha(fecha);
    dias.push({ fecha: clave, diaSemana: cola.diaSemana(clave), abierto: cola.estaAbierto(clave) });
  }
  res.json(dias);
}

// GET /api/horarios/semanal
// Lectura pública del horario habitual (lo usa el encabezado y el modal
// de horario semanal para mostrar los valores actuales antes de editarlos).
function obtenerHorarioSemanal(req, res) {
  const filas = db.prepare(
    'SELECT dia_semana AS diaSemana, abierto, hora_inicio AS horaInicio, hora_fin AS horaFin FROM horario_semanal ORDER BY dia_semana'
  ).all();
  res.json(filas.map(f => ({ ...f, abierto: !!f.abierto })));
}

// GET /api/horarios/:fecha
// Todo lo que la pantalla de reserva necesita para un día: si está abierto,
// el horario habitual, y la disponibilidad (cupos u horas exactas).
function obtenerDia(req, res) {
  const { fecha } = req.params;
  const abierto = cola.estaAbierto(fecha);
  const horarioBase = cola.obtenerHorarioBase(fecha);
  const disponibilidad = cola.obtenerDisponibilidad(fecha);

  res.json({ fecha, abierto, horarioBase, ...disponibilidad });
}

// PUT /api/horarios/semanal   body: { dias: [{ diaSemana, abierto, horaInicio, horaFin }, ...] }
function actualizarHorarioSemanal(req, res) {
  const { dias } = req.body;
  if (!Array.isArray(dias) || dias.length === 0) {
    return res.status(400).json({ error: 'Debes enviar la lista de días' });
  }

  const actualizar = db.prepare(
    'UPDATE horario_semanal SET abierto = ?, hora_inicio = ?, hora_fin = ? WHERE dia_semana = ?'
  );
  const transaccion = db.transaction(() => {
    for (const d of dias) actualizar.run(d.abierto ? 1 : 0, d.horaInicio, d.horaFin, d.diaSemana);
  });
  transaccion();

  res.json({ ok: true });
}

// PUT /api/horarios/:fecha/cierre   body: { cerrado: true|false }
// Cerrar o reabrir puntualmente una fecha (reemplaza el DATE_OVERRIDE de localStorage).
function actualizarCierre(req, res) {
  const { fecha } = req.params;
  const { cerrado } = req.body;

  db.prepare(`
    INSERT INTO cierres_fecha (fecha, cerrado) VALUES (?, ?)
    ON CONFLICT(fecha) DO UPDATE SET cerrado = excluded.cerrado
  `).run(fecha, cerrado ? 1 : 0);

  res.json({ fecha, cerrado: !!cerrado });
}

// DELETE /api/horarios/:fecha/cierre
// Quita la excepción puntual: la fecha vuelve a seguir el horario semanal normal.
function borrarCierre(req, res) {
  db.prepare('DELETE FROM cierres_fecha WHERE fecha = ?').run(req.params.fecha);
  res.json({ fecha: req.params.fecha, cerrado: cola.estaAbierto(req.params.fecha) === false });
}

// PUT /api/horarios/:fecha/configuracion
// body: { capacidad, minutosPorCliente, usaHorariosExactos, horas: [...], scope: 'semana'|'dia' }
function actualizarConfiguracionDia(req, res) {
  const { fecha } = req.params;
  const { capacidad, minutosPorCliente, usaHorariosExactos, horas, scope } = req.body;

  cola.guardarConfiguracionDia(fecha, { capacidad, minutosPorCliente, usaHorariosExactos });
  if (usaHorariosExactos) cola.guardarHorariosExactos(fecha, Array.isArray(horas) ? horas : [], scope);

  res.json({ fecha, ...cola.obtenerDisponibilidad(fecha) });
}

// DELETE /api/horarios/:fecha/horarios-exactos
// Quita la excepción puntual de horas para esta fecha; vuelve a seguir la
// plantilla semanal de ese día.
function quitarHorarioPropio(req, res) {
  cola.quitarHorarioPropio(req.params.fecha);
  res.json({ fecha: req.params.fecha, ...cola.obtenerDisponibilidad(req.params.fecha) });
}

module.exports = {
  listarProximosDias,
  obtenerHorarioSemanal,
  obtenerDia,
  actualizarHorarioSemanal,
  actualizarCierre,
  borrarCierre,
  actualizarConfiguracionDia,
  quitarHorarioPropio
};
