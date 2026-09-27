const db = require('../db');

const DEFAULT_CAPACIDAD = 18;
const DEFAULT_MINUTOS_POR_CLIENTE = 30;
const ESTADOS_QUE_OCUPAN_CUPO = ['pendiente_pago', 'pendiente_aprobacion', 'confirmado', 'completado'];

function diaSemana(fecha) {
  // fecha viene como 'YYYY-MM-DD'; se arma en horario local para evitar
  // que el corrimiento a UTC cambie el día de la semana.
  return new Date(fecha + 'T00:00:00').getDay();
}

// ---------- Abierto / cerrado ----------

function obtenerCierre(fecha) {
  return db.prepare('SELECT cerrado FROM cierres_fecha WHERE fecha = ?').get(fecha) || null;
}

function estaAbierto(fecha) {
  const override = obtenerCierre(fecha);
  if (override) return !override.cerrado;

  const semanal = db.prepare('SELECT abierto FROM horario_semanal WHERE dia_semana = ?').get(diaSemana(fecha));
  return semanal ? !!semanal.abierto : false;
}

// Horario habitual (para mostrar "8:00 a 5:30pm" en la interfaz), sin tener
// en cuenta horarios exactos puntuales — eso se resuelve en obtenerDisponibilidad.
function obtenerHorarioBase(fecha) {
  return db.prepare('SELECT hora_inicio AS horaInicio, hora_fin AS horaFin FROM horario_semanal WHERE dia_semana = ?')
    .get(diaSemana(fecha));
}

// ---------- Configuración por día ----------

function obtenerConfiguracionDia(fecha) {
  const fila = db.prepare(
    'SELECT capacidad, minutos_por_cliente AS minutosPorCliente, usa_horarios_exactos AS usaHorariosExactos FROM configuracion_dia WHERE fecha = ?'
  ).get(fecha);

  return {
    capacidad: fila?.capacidad ?? DEFAULT_CAPACIDAD,
    minutosPorCliente: fila?.minutosPorCliente ?? DEFAULT_MINUTOS_POR_CLIENTE,
    usaHorariosExactos: !!fila?.usaHorariosExactos
  };
}

function guardarConfiguracionDia(fecha, { capacidad, minutosPorCliente, usaHorariosExactos }) {
  db.prepare(`
    INSERT INTO configuracion_dia (fecha, capacidad, minutos_por_cliente, usa_horarios_exactos)
    VALUES (@fecha, @capacidad, @minutosPorCliente, @usaHorariosExactos)
    ON CONFLICT(fecha) DO UPDATE SET
      capacidad = excluded.capacidad,
      minutos_por_cliente = excluded.minutos_por_cliente,
      usa_horarios_exactos = excluded.usa_horarios_exactos
  `).run({ fecha, capacidad, minutosPorCliente, usaHorariosExactos: usaHorariosExactos ? 1 : 0 });
}

// ---------- Horarios exactos ----------

// Una fecha puntual con horas propias manda sobre la plantilla semanal;
// si no tiene, se usa lo que la dueña dejó guardado para ese día de semana.
function tieneHorarioPropio(fecha) {
  return !!db.prepare('SELECT 1 FROM horarios_exactos WHERE fecha = ? LIMIT 1').get(fecha);
}

function obtenerHorariosExactos(fecha) {
  const propios = db.prepare('SELECT hora FROM horarios_exactos WHERE fecha = ? ORDER BY hora').all(fecha).map(r => r.hora);
  if (propios.length > 0) return propios;
  return db.prepare('SELECT hora FROM horarios_exactos_semanal WHERE dia_semana = ? ORDER BY hora')
    .all(diaSemana(fecha)).map(r => r.hora);
}

// scope 'semana' (por defecto): guarda como plantilla, aplica a ese día de
// la semana en general. scope 'dia': guarda solo para esta fecha puntual
// (una excepción que no afecta las demás semanas).
function guardarHorariosExactos(fecha, horas, scope = 'semana') {
  const transaccion = db.transaction(() => {
    if (scope === 'dia') {
      db.prepare('DELETE FROM horarios_exactos WHERE fecha = ?').run(fecha);
      const insertar = db.prepare('INSERT INTO horarios_exactos (fecha, hora) VALUES (?, ?)');
      for (const hora of horas) insertar.run(fecha, hora);
    } else {
      const dow = diaSemana(fecha);
      db.prepare('DELETE FROM horarios_exactos_semanal WHERE dia_semana = ?').run(dow);
      const insertar = db.prepare('INSERT INTO horarios_exactos_semanal (dia_semana, hora) VALUES (?, ?)');
      for (const hora of horas) insertar.run(dow, hora);
      // Si esta fecha tenía una excepción puntual, se limpia para que
      // vuelva a seguir la plantilla recién guardada.
      db.prepare('DELETE FROM horarios_exactos WHERE fecha = ?').run(fecha);
    }
  });
  transaccion();
}

function quitarHorarioPropio(fecha) {
  db.prepare('DELETE FROM horarios_exactos WHERE fecha = ?').run(fecha);
}

// ---------- Cupos ocupados ----------

// Turnos que ya cuentan contra la capacidad o contra una hora exacta
// (rechazados y cancelados liberan el cupo, por eso quedan fuera).
function contarTurnosActivos(fecha) {
  const { total } = db.prepare(
    `SELECT COUNT(*) AS total FROM turnos WHERE fecha = ? AND estado IN (${ESTADOS_QUE_OCUPAN_CUPO.map(() => '?').join(',')})`
  ).get(fecha, ...ESTADOS_QUE_OCUPAN_CUPO);
  return total;
}

function horasOcupadas(fecha) {
  return db.prepare(
    `SELECT hora FROM turnos WHERE fecha = ? AND hora IS NOT NULL AND estado IN (${ESTADOS_QUE_OCUPAN_CUPO.map(() => '?').join(',')})`
  ).all(fecha, ...ESTADOS_QUE_OCUPAN_CUPO).map(r => r.hora);
}

// Convierte una cantidad de turnos que faltan en un texto de tiempo
// aproximado ("~20 min", "~1 h 10 min"), igual que el estimatedWaitLabel original.
function textoEsperaEstimada(turnosAdelante, minutosPorCliente) {
  const minutos = turnosAdelante * minutosPorCliente;
  if (minutos <= 0) return null;
  if (minutos < 60) return `~${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `~${horas} h` : `~${horas} h ${resto} min`;
}

// ---------- Disponibilidad completa de un día ----------
// Punto único que usa tanto la pantalla de reserva del cliente como la
// validación del backend al crear un turno, para que nunca queden
// desincronizados (una de las reglas que ya seguía tu app.js original).
function obtenerDisponibilidad(fecha) {
  const abierto = estaAbierto(fecha);
  if (!abierto) return { abierto: false };

  const config = obtenerConfiguracionDia(fecha);

  if (config.usaHorariosExactos) {
    const ocupadas = new Set(horasOcupadas(fecha));
    const horas = obtenerHorariosExactos(fecha).map(hora => ({ hora, libre: !ocupadas.has(hora) }));
    return { abierto: true, modo: 'horarios_exactos', horas, horariosPropios: tieneHorarioPropio(fecha) };
  }

  const turnosAdelante = contarTurnosActivos(fecha);
  return {
    abierto: true,
    modo: 'capacidad',
    capacidad: config.capacidad,
    turnosAdelante,
    hayCupo: turnosAdelante < config.capacidad,
    esperaEstimada: textoEsperaEstimada(turnosAdelante, config.minutosPorCliente)
  };
}

module.exports = {
  diaSemana,
  estaAbierto,
  obtenerHorarioBase,
  obtenerConfiguracionDia,
  guardarConfiguracionDia,
  obtenerHorariosExactos,
  guardarHorariosExactos,
  tieneHorarioPropio,
  quitarHorarioPropio,
  obtenerCierre,
  obtenerDisponibilidad
};
