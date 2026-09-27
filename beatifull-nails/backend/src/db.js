const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'beatifull-nails.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- Horario habitual de cada día de la semana (0=domingo .. 6=sábado).
  -- Reemplaza a DEFAULT_SCHEDULE, que antes vivía fijo en js/config.js.
  CREATE TABLE IF NOT EXISTS horario_semanal (
    dia_semana   INTEGER PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6),
    abierto      INTEGER NOT NULL DEFAULT 1,
    hora_inicio  TEXT NOT NULL,
    hora_fin     TEXT NOT NULL
  );

  -- Excepciones puntuales: cerrar (o reabrir) una fecha específica que
  -- rompe el patrón semanal. Reemplaza el DATE_OVERRIDE_PREFIX de localStorage.
  CREATE TABLE IF NOT EXISTS cierres_fecha (
    fecha    TEXT PRIMARY KEY,
    cerrado  INTEGER NOT NULL DEFAULT 1
  );

  -- Capacidad y minutos por cliente configurados para un día puntual.
  -- Si una fecha no aparece acá, se usan los valores por defecto de la app.
  CREATE TABLE IF NOT EXISTS configuracion_dia (
    fecha               TEXT PRIMARY KEY,
    capacidad           INTEGER,
    minutos_por_cliente INTEGER,
    usa_horarios_exactos INTEGER NOT NULL DEFAULT 0
  );

  -- Horas exactas habilitadas para un día puntual (cuando la dueña prefiere
  -- cargar horarios a mano en vez de dejar que la app cuente por capacidad).
  CREATE TABLE IF NOT EXISTS horarios_exactos (
    fecha  TEXT NOT NULL,
    hora   TEXT NOT NULL,
    PRIMARY KEY (fecha, hora)
  );

  -- Plantilla: horas exactas que se repiten cada semana para un día
  -- determinado (ej. "todos los martes: 8:00, 10:00, 1:00pm"). Una fecha
  -- puntual en horarios_exactos tiene prioridad sobre esta plantilla.
  CREATE TABLE IF NOT EXISTS horarios_exactos_semanal (
    dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora       TEXT NOT NULL,
    PRIMARY KEY (dia_semana, hora)
  );

  -- Cada turno pedido, sea por fila (capacidad) o por horario exacto.
  CREATE TABLE IF NOT EXISTS turnos (
    id                TEXT PRIMARY KEY,
    fecha             TEXT NOT NULL,
    hora              TEXT,
    cliente_nombre    TEXT NOT NULL,
    cliente_telefono  TEXT NOT NULL,
    metodo_pago       TEXT NOT NULL CHECK (metodo_pago IN ('linea','efectivo')),
    estado            TEXT NOT NULL DEFAULT 'pendiente_pago'
                        CHECK (estado IN (
                          'pendiente_pago', 'pendiente_aprobacion',
                          'confirmado', 'rechazado', 'completado', 'cancelado'
                        )),
    total              INTEGER NOT NULL,
    pago_id            TEXT,
    notificacion_player_id TEXT,
    creado_en          TEXT NOT NULL
  );

  -- Servicios elegidos en cada turno, con el precio vigente al momento de
  -- reservar (así un cambio de precio futuro no altera turnos ya hechos).
  CREATE TABLE IF NOT EXISTS turno_servicios (
    turno_id      TEXT NOT NULL REFERENCES turnos(id) ON DELETE CASCADE,
    servicio_id   TEXT NOT NULL,
    nombre        TEXT NOT NULL,
    precio        INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
  CREATE INDEX IF NOT EXISTS idx_turno_servicios_turno ON turno_servicios(turno_id);
`);

// ---------- Semilla: horario semanal por defecto ----------
// Solo siembra si la tabla está vacía, para no pisar cambios que la dueña
// ya haya guardado en despliegues anteriores.
function sembrarHorarioSemanalSiVacio() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM horario_semanal').get();
  if (total > 0) return;

  const DEFAULT_SCHEDULE = [
    { dia: 0, inicio: '08:00', fin: '14:00' }, // Domingo
    { dia: 1, inicio: '08:00', fin: '17:30' },
    { dia: 2, inicio: '08:00', fin: '17:30' },
    { dia: 3, inicio: '08:00', fin: '17:30' },
    { dia: 4, inicio: '08:00', fin: '17:30' },
    { dia: 5, inicio: '08:00', fin: '17:30' },
    { dia: 6, inicio: '08:00', fin: '17:30' }
  ];

  const insertar = db.prepare(
    'INSERT INTO horario_semanal (dia_semana, abierto, hora_inicio, hora_fin) VALUES (?,1,?,?)'
  );
  const transaccion = db.transaction(() => {
    for (const d of DEFAULT_SCHEDULE) insertar.run(d.dia, d.inicio, d.fin);
  });
  transaccion();
}

sembrarHorarioSemanalSiVacio();

// Migración liviana: agrega la columna si la base ya existía de antes de
// sumar las notificaciones push (SQLite no tiene "ADD COLUMN IF NOT EXISTS").
try {
  db.exec('ALTER TABLE turnos ADD COLUMN aviso_enviado INTEGER NOT NULL DEFAULT 0');
} catch (e) {
  // La columna ya existe: no hay nada que hacer.
}

module.exports = db;
