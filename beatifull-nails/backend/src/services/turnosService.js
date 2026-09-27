const db = require('../db');
const cola = require('./colaService');
const notificaciones = require('./notificaciones');
const { buscarServicio } = require('../config/servicios');

const ESTADOS_ACTIVOS = ['pendiente_pago', 'pendiente_aprobacion', 'confirmado', 'completado'];

function nuevoId() {
  return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// ---------- Crear turno ----------
// Toda la validación vive acá, en un solo lugar, para que sin importar
// quién llame a crearTurno (la ruta pública, o más adelante un panel
// interno) las mismas reglas se apliquen siempre igual.
function crearTurno({ fecha, hora, clienteNombre, clienteTelefono, servicioIds, metodoPago }) {
  if (!fecha || !clienteNombre || !clienteTelefono) {
    return { ok: false, error: 'datos_incompletos', message: 'Faltan datos obligatorios del turno.' };
  }
  if (!['linea', 'efectivo'].includes(metodoPago)) {
    return { ok: false, error: 'metodo_pago_invalido', message: 'El método de pago debe ser "linea" o "efectivo".' };
  }

  if (!cola.estaAbierto(fecha)) {
    return { ok: false, error: 'dia_cerrado', message: 'Ese día está cerrado.' };
  }

  // Los servicios siempre se resuelven contra el catálogo del backend:
  // el cliente manda ids, nunca nombres ni precios (ver config/servicios.js).
  const servicios = resolverServicios(servicioIds);
  if (!servicios.ok) return servicios;

  const disponibilidad = cola.obtenerDisponibilidad(fecha);
  const horaFinal = validarHora(disponibilidad, hora);
  if (!horaFinal.ok) return horaFinal;

  const total = servicios.items.reduce((suma, s) => suma + s.precio, 0);
  const id = nuevoId();
  const estadoInicial = metodoPago === 'linea' ? 'pendiente_pago' : 'pendiente_aprobacion';

  // Se crea el turno y sus servicios en una sola transacción: si algo
  // falla a mitad de camino, no queda un turno "a medias" sin servicios.
  const transaccion = db.transaction(() => {
    db.prepare(`
      INSERT INTO turnos (id, fecha, hora, cliente_nombre, cliente_telefono, metodo_pago, estado, total, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, fecha, horaFinal.hora, clienteNombre, clienteTelefono, metodoPago, estadoInicial, total, new Date().toISOString());

    const insertarServicio = db.prepare(
      'INSERT INTO turno_servicios (turno_id, servicio_id, nombre, precio) VALUES (?, ?, ?, ?)'
    );
    for (const s of servicios.items) insertarServicio.run(id, s.id, s.nombre, s.precio);
  });
  transaccion();

  return { ok: true, turno: obtenerTurnoCompleto(id) };
}

function resolverServicios(servicioIds) {
  if (!Array.isArray(servicioIds) || servicioIds.length === 0) {
    return { ok: false, error: 'servicios_requeridos', message: 'Elegí al menos un servicio para reservar.' };
  }
  const items = [];
  for (const id of servicioIds) {
    const servicio = buscarServicio(id);
    if (!servicio) return { ok: false, error: 'servicio_invalido', message: `El servicio "${id}" no existe.` };
    items.push(servicio);
  }
  return { ok: true, items };
}

// Decide y valida la hora del turno según el modo del día: en "horarios
// exactos" la hora es obligatoria y debe estar libre; en modo "capacidad"
// no se guarda hora (el orden de llegada define el turno en la fila).
function validarHora(disponibilidad, horaPedida) {
  if (!disponibilidad.abierto) {
    return { ok: false, error: 'dia_cerrado', message: 'Ese día está cerrado.' };
  }
  if (disponibilidad.modo !== 'horarios_exactos') {
    return { ok: true, hora: null };
  }
  const slot = disponibilidad.horas.find(h => h.hora === horaPedida);
  if (!slot) return { ok: false, error: 'hora_invalida', message: 'Elegí una hora válida de las disponibles.' };
  if (!slot.libre) return { ok: false, error: 'hora_ocupada', message: 'Esa hora ya fue tomada por otra persona.' };
  return { ok: true, hora: horaPedida };
}

// ---------- Lectura ----------

// incluirPrivado=true agrega teléfono y servicios (solo para la dueña),
// igual que el parámetro includePhone del listByDate original.
function obtenerTurnosPorFecha(fecha, incluirPrivado) {
  const filas = db.prepare(`
    SELECT id, fecha, hora, cliente_nombre AS clienteNombre, estado, total, metodo_pago AS metodoPago, creado_en AS creadoEn
    ${incluirPrivado ? ', cliente_telefono AS clienteTelefono' : ''}
    FROM turnos WHERE fecha = ? AND estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')}, 'rechazado', 'cancelado')
    ORDER BY (hora IS NULL), hora, creado_en
  `).all(fecha, ...ESTADOS_ACTIVOS);

  if (!incluirPrivado) return filas;
  return filas.map(t => ({ ...t, servicios: obtenerServiciosDeTurno(t.id) }));
}

function obtenerServiciosDeTurno(turnoId) {
  return db.prepare('SELECT servicio_id AS id, nombre, precio FROM turno_servicios WHERE turno_id = ?').all(turnoId);
}

function obtenerTurnoCompleto(id) {
  const turno = db.prepare(`
    SELECT id, fecha, hora, cliente_nombre AS clienteNombre, cliente_telefono AS clienteTelefono,
           metodo_pago AS metodoPago, estado, total, pago_id AS pagoId, creado_en AS creadoEn
    FROM turnos WHERE id = ?
  `).get(id);
  if (!turno) return null;
  return { ...turno, servicios: obtenerServiciosDeTurno(id) };
}

// ---------- Acciones de la dueña ----------

function cambiarHora(id, horaNueva) {
  const turno = obtenerTurnoCompleto(id);
  if (!turno) return { ok: false, error: 'no_encontrado', message: 'No se encontró el turno.' };

  const disponibilidad = cola.obtenerDisponibilidad(turno.fecha);
  if (disponibilidad.modo !== 'horarios_exactos') {
    return { ok: false, error: 'sin_horarios', message: 'Este día no usa horarios exactos.' };
  }
  const slot = disponibilidad.horas.find(h => h.hora === horaNueva);
  if (!slot) return { ok: false, error: 'hora_invalida', message: 'Esa hora no pertenece al horario configurado.' };
  if (!slot.libre && horaNueva !== turno.hora) {
    return { ok: false, error: 'hora_ocupada', message: 'Esa hora ya está ocupada por otra reserva.' };
  }

  db.prepare('UPDATE turnos SET hora = ? WHERE id = ?').run(horaNueva, id);
  return { ok: true, turno: obtenerTurnoCompleto(id) };
}

// Alterna entre "confirmado" y "completado" — el equivalente al toggle de
// "Atendido" original, aplicado solo a turnos que ya están confirmados.
function alternarAtendido(id) {
  const turno = obtenerTurnoCompleto(id);
  if (!turno) return { ok: false, error: 'no_encontrado', message: 'No se encontró el turno.' };
  if (!['confirmado', 'completado'].includes(turno.estado)) {
    return { ok: false, error: 'estado_invalido', message: 'Solo se puede marcar como atendido un turno confirmado.' };
  }
  const nuevoEstado = turno.estado === 'completado' ? 'confirmado' : 'completado';
  db.prepare('UPDATE turnos SET estado = ? WHERE id = ?').run(nuevoEstado, id);
  return { ok: true, turno: obtenerTurnoCompleto(id) };
}

// Aprobar/rechazar un turno pagado en efectivo (la decisión que definimos:
// el horario ya estaba reservado desde que se pidió, así que rechazar
// simplemente libera ese cupo/hora para otra persona).
function aprobarEfectivo(id) {
  return cambiarEstadoDesde(id, 'pendiente_aprobacion', 'confirmado');
}

function rechazarEfectivo(id) {
  return cambiarEstadoDesde(id, 'pendiente_aprobacion', 'rechazado');
}

function cambiarEstadoDesde(id, estadoEsperado, estadoNuevo) {
  const turno = obtenerTurnoCompleto(id);
  if (!turno) return { ok: false, error: 'no_encontrado', message: 'No se encontró el turno.' };
  if (turno.estado !== estadoEsperado) {
    return { ok: false, error: 'estado_invalido', message: `El turno ya no está en estado "${estadoEsperado}".` };
  }
  db.prepare('UPDATE turnos SET estado = ? WHERE id = ?').run(estadoNuevo, id);
  return { ok: true, turno: obtenerTurnoCompleto(id) };
}

function confirmarPagoEnLinea(id) {
  return cambiarEstadoDesde(id, 'pendiente_pago', 'confirmado');
}

// Si alguien elige pagar en línea y nunca completa el pago (cierra la
// pestaña, se arrepiente, etc.), el turno se queda en 'pendiente_pago'
// ocupando un cupo/hora para siempre. Esto libera esos turnos pasado un
// tiempo razonable, sin afectar a los que sí están confirmados o en
// aprobación de efectivo.
const MINUTOS_EXPIRACION_PAGO = 15;
function expirarPendientesDePago() {
  const limite = new Date(Date.now() - MINUTOS_EXPIRACION_PAGO * 60000).toISOString();
  const resultado = db.prepare(
    `UPDATE turnos SET estado = 'cancelado' WHERE estado = 'pendiente_pago' AND creado_en < ?`
  ).run(limite);
  return resultado.changes;
}

// Borra turnos de fechas de más de "dias" de antigüedad (por defecto 7),
// igual que el cleanupOld de Code.gs. Se puede llamar manualmente (botón
// "Limpiar ahora" del historial) o automáticamente (ver server.js).
function limpiarAntiguos(dias = 7) {
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  const limiteStr = limite.toISOString().slice(0, 10);
  const resultado = db.prepare('DELETE FROM turnos WHERE fecha < ?').run(limiteStr);
  return resultado.changes;
}

function eliminarTurno(id) {
  const resultado = db.prepare('DELETE FROM turnos WHERE id = ?').run(id);
  return resultado.changes > 0;
}

function vaciarDia(fecha) {
  db.prepare('DELETE FROM turnos WHERE fecha = ?').run(fecha);
}

function historial() {
  return db.prepare(`
    SELECT fecha, COUNT(*) AS cantidad FROM turnos
    WHERE estado IN (${ESTADOS_ACTIVOS.map(() => '?').join(',')})
    GROUP BY fecha ORDER BY fecha DESC
  `).all(...ESTADOS_ACTIVOS);
}

function guardarNotificacion(id, playerId) {
  db.prepare('UPDATE turnos SET notificacion_player_id = ? WHERE id = ?').run(playerId || null, id);
}

// Revisa el día de hoy y le avisa a quien esté por entrar. Se llama cada
// minuto desde server.js; cada turno solo recibe un aviso (aviso_enviado).
async function verificarYNotificar() {
  const fecha = new Date().toISOString().slice(0, 10);
  const disponibilidad = cola.obtenerDisponibilidad(fecha);
  if (!disponibilidad.abierto) return;

  const candidatos = db.prepare(`
    SELECT id, hora, notificacion_player_id AS playerId
    FROM turnos
    WHERE fecha = ? AND estado = 'confirmado' AND notificacion_player_id IS NOT NULL AND aviso_enviado = 0
  `).all(fecha);
  if (candidatos.length === 0) return;

  if (disponibilidad.modo === 'horarios_exactos') {
    const ahora = Date.now();
    for (const t of candidatos) {
      if (!t.hora) continue;
      const objetivo = new Date(fecha + 'T' + t.hora + ':00').getTime();
      const minutosFaltan = Math.round((objetivo - ahora) / 60000);
      if (minutosFaltan >= 0 && minutosFaltan <= 15) {
        const resultado = await notificaciones.enviarPush(t.playerId, `Ya casi es tu turno: hoy a las ${t.hora}. ¡Te esperamos en Beatifull Nails!`);
        if (resultado.ok) db.prepare('UPDATE turnos SET aviso_enviado = 1 WHERE id = ?').run(t.id);
      }
    }
    return;
  }

  // Modo capacidad: se avisa cuando quedan 2 o menos personas activas antes,
  // sin contar los pendientes de pago/aprobación como "delante en la fila".
  const ordenActivos = db.prepare(
    `SELECT id FROM turnos WHERE fecha = ? AND estado = 'confirmado' ORDER BY creado_en`
  ).all(fecha).map(r => r.id);

  for (const t of candidatos) {
    const posicion = ordenActivos.indexOf(t.id);
    if (posicion === -1 || posicion > 2) continue;
    const mensaje = posicion === 0
      ? '¡Es tu turno! Te esperamos en Beatifull Nails.'
      : `Ya casi es tu turno en Beatifull Nails, faltan ${posicion} persona${posicion === 1 ? '' : 's'} antes que tú.`;
    const resultado = await notificaciones.enviarPush(t.playerId, mensaje);
    if (resultado.ok) db.prepare('UPDATE turnos SET aviso_enviado = 1 WHERE id = ?').run(t.id);
  }
}

module.exports = {
  crearTurno,
  obtenerTurnosPorFecha,
  obtenerTurnoCompleto,
  cambiarHora,
  alternarAtendido,
  aprobarEfectivo,
  rechazarEfectivo,
  confirmarPagoEnLinea,
  expirarPendientesDePago,
  limpiarAntiguos,
  eliminarTurno,
  vaciarDia,
  historial,
  guardarNotificacion,
  verificarYNotificar
};
