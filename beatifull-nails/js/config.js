/*
 * BEATIFULL NAILS — Configuración y datos estáticos
 *
 * Este archivo contiene valores que cambian poco y que no representan lógica
 * de negocio: URL del backend, claves de almacenamiento local, valores por
 * defecto, calendario y catálogo de servicios.
 */

const ONESIGNAL_APP_ID = 'c6d1e2f6-d349-4628-ab8d-1b73922668f2';

const API_URL = 'https://script.google.com/macros/s/AKfycbw2PC9FK1lA0nkfO7Gm65nCgyMAG_CYm_J7xaFrxn6hT10Mq804raWvy1FMnxZn4uUqGQ/exec';

const DEFAULT_CAPACITY = 18;
const DEFAULT_MINUTES_PER_CLIENT = 30;

const CAPACITY_PREFIX = 'beatifullnails_capacidad_';
const MINUTES_PREFIX = 'beatifullnails_minutoscliente_';
const SLOTS_PREFIX = 'beatifullnails_horarios_';
const SLOTS_ENABLED_PREFIX = 'beatifullnails_horarios_on_';
const SCHEDULE_KEY = 'beatifullnails_horario_semanal';
const DATE_OVERRIDE_PREFIX = 'beatifullnails_cierre_';
const MY_TURNS_KEY = 'beatifullnails_mis_turnos';
const CLEANUP_LAST_RUN_KEY = 'beatifullnails_cleanup_lastrun';

const DEFAULT_SCHEDULE = {
  0: {open: true, label: 'Dom', start: '08:00', end: '14:00'},
  1: {open: true, label: 'Lun', start: '08:00', end: '17:30'},
  2: {open: true, label: 'Mar', start: '08:00', end: '17:30'},
  3: {open: true, label: 'Mié', start: '08:00', end: '17:30'},
  4: {open: true, label: 'Jue', start: '08:00', end: '17:30'},
  5: {open: true, label: 'Vie', start: '08:00', end: '17:30'},
  6: {open: true, label: 'Sáb', start: '08:00', end: '17:30'}
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const SCHEDULE_EDIT_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun..Dom

const SERVICIOS_CATALOGO = [
  { id: 'semimanos', nombre: 'Semipermanente manos+uñas (mujer)', precio: 65000 },
  { id: 'semimanos', nombre: 'Semipermanente manos (mujer)', precio: 55000 },
  { id: 'semipies', nombre: 'Semipermanente pies (mujer)', precio: 40000 },
  { id: 'semihombre', nombre: 'Semipermanente mano (hombre)', precio: 35000 },
  { id: 'semipies2', nombre: 'Semipermanente pies (hombre)', precio: 25000 },
  { id: 'dipping', nombre: 'Dipping', precio: 70000 },
  { id: 'gel', nombre: 'Gel', precio: 65000 },
  { id: 'presson', nombre: 'Press On', precio: 80000 },
  { id: 'acrilico', nombre: 'Acrílico', precio: 85000 },
  { id: 'polygel', nombre: 'Polygel', precio: 75000 },
  { id: 'forrado', nombre: 'Forrado de acrílico', precio: 80000 },
  { id: 'acriesculpido', nombre: 'Acrílico esculpido', precio: 100000 },
  { id: 'acriencapsulado', nombre: 'Acrílico esculpido + encapsulado', precio: 120000 },
  { id: 'gelrubber', nombre: 'Gel rubber', precio: 55000 },
  { id: 'buildergel', nombre: 'Builder gel', precio: 60000 },
  { id: 'retoque', nombre: 'Retoque', precio: -15000 }
];
