const turnos = require('../services/turnosService');

// POST /api/turnos
function crear(req, res) {
  const { fecha, hora, clienteNombre, clienteTelefono, servicios, metodoPago } = req.body;
  const resultado = turnos.crearTurno({
    fecha, hora, clienteNombre, clienteTelefono, servicioIds: servicios, metodoPago
  });
  if (!resultado.ok) return res.status(400).json(resultado);
  res.status(201).json(resultado.turno);
}

// GET /api/turnos/:fecha  (detectarOwner ya decidió req.esDueña)
function listarPorFecha(req, res) {
  res.json(turnos.obtenerTurnosPorFecha(req.params.fecha, req.esDueña));
}

// GET /api/turnos/uno/:id
function obtenerUno(req, res) {
  const turno = turnos.obtenerTurnoCompleto(req.params.id);
  if (!turno) return res.status(404).json({ error: 'no_encontrado', message: 'No se encontró el turno.' });
  res.json(turno);
}

// PATCH /api/turnos/:id/hora   body: { hora }
function cambiarHora(req, res) {
  const resultado = turnos.cambiarHora(req.params.id, req.body.hora);
  if (!resultado.ok) return res.status(400).json(resultado);
  res.json(resultado.turno);
}

// PATCH /api/turnos/:id/atendido
function alternarAtendido(req, res) {
  const resultado = turnos.alternarAtendido(req.params.id);
  if (!resultado.ok) return res.status(400).json(resultado);
  res.json(resultado.turno);
}

// PATCH /api/turnos/:id/aprobar   (solo turnos en efectivo, pendientes)
function aprobar(req, res) {
  const resultado = turnos.aprobarEfectivo(req.params.id);
  if (!resultado.ok) return res.status(400).json(resultado);
  res.json(resultado.turno);
}

// PATCH /api/turnos/:id/rechazar
function rechazar(req, res) {
  const resultado = turnos.rechazarEfectivo(req.params.id);
  if (!resultado.ok) return res.status(400).json(resultado);
  res.json(resultado.turno);
}

// DELETE /api/turnos/:id
function eliminar(req, res) {
  const borrado = turnos.eliminarTurno(req.params.id);
  if (!borrado) return res.status(404).json({ error: 'no_encontrado', message: 'No se encontró el turno.' });
  res.json({ ok: true });
}

// DELETE /api/turnos/dia/:fecha
function vaciarDia(req, res) {
  turnos.vaciarDia(req.params.fecha);
  res.json({ ok: true });
}

// GET /api/turnos/reportes/historial
function historial(req, res) {
  res.json(turnos.historial());
}

// POST /api/turnos/:id/notificaciones   body: { playerId }
function guardarNotificacion(req, res) {
  turnos.guardarNotificacion(req.params.id, req.body.playerId);
  res.json({ ok: true });
}

// POST /api/turnos/reportes/limpiar
function limpiar(req, res) {
  const eliminados = turnos.limpiarAntiguos();
  res.json({ ok: true, eliminados });
}

module.exports = {
  crear, listarPorFecha, obtenerUno, cambiarHora, alternarAtendido,
  aprobar, rechazar, eliminar, vaciarDia, historial, guardarNotificacion, limpiar
};
