const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data', 'turnos.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS estilistas (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    especialidad TEXT,
    hora_inicio TEXT NOT NULL,
    hora_fin TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servicios (
    id TEXT PRIMARY KEY,
    estilista_id TEXT NOT NULL REFERENCES estilistas(id),
    nombre TEXT NOT NULL,
    precio INTEGER NOT NULL,
    duracion_min INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS turnos (
    id TEXT PRIMARY KEY,
    estilista_id TEXT NOT NULL REFERENCES estilistas(id),
    servicio_id TEXT NOT NULL REFERENCES servicios(id),
    dia TEXT NOT NULL,
    hora TEXT NOT NULL,
    cliente_nombre TEXT NOT NULL,
    cliente_telefono TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente_pago',
    pago_id TEXT,
    creado_en TEXT NOT NULL
  );
`);

function sembrarSiVacia() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM estilistas').get();
  if (total > 0) return;

  const insertarEstilista = db.prepare(
    'INSERT INTO estilistas (id, nombre, especialidad, hora_inicio, hora_fin) VALUES (?,?,?,?,?)'
  );
  const insertarServicio = db.prepare(
    'INSERT INTO servicios (id, estilista_id, nombre, precio, duracion_min) VALUES (?,?,?,?,?)'
  );

  const seed = [
    { id: 's1', nombre: 'Valentina Ríos', especialidad: 'Uñas acrílicas y nail art',
      servicios: [
        { id: 'sv1', nombre: 'Manicure clásico', precio: 35000, duracionMin: 45 },
        { id: 'sv2', nombre: 'Acrílicas con diseño', precio: 75000, duracionMin: 90 },
        { id: 'sv3', nombre: 'Retoque gel', precio: 45000, duracionMin: 60 }
      ]},
    { id: 's2', nombre: 'Camila Torres', especialidad: 'Semipermanente y spa de manos',
      servicios: [
        { id: 'sv4', nombre: 'Esmaltado semipermanente', precio: 30000, duracionMin: 40 },
        { id: 'sv5', nombre: 'Spa de manos completo', precio: 55000, duracionMin: 70 }
      ]},
    { id: 's3', nombre: 'Daniela Ospina', especialidad: 'Nail art y encapsulados',
      servicios: [
        { id: 'sv6', nombre: 'Encapsulado con flores', precio: 80000, duracionMin: 100 },
        { id: 'sv7', nombre: 'Manicure + diseño 3D', precio: 65000, duracionMin: 80 }
      ]}
  ];

  const transaccion = db.transaction(() => {
    for (const e of seed) {
      insertarEstilista.run(e.id, e.nombre, e.especialidad, '09:00', '18:00');
      for (const s of e.servicios) {
        insertarServicio.run(s.id, e.id, s.nombre, s.precio, s.duracionMin);
      }
    }
  });
  transaccion();
}

sembrarSiVacia();

module.exports = db;
