/*
 * BEATIFULL NAILS — Configuración del frontend
 *
 * El catálogo, los horarios y las reservas se consultan al backend.
 * En producción, el backend está publicado en Railway.
 */

const ONESIGNAL_APP_ID = 'c6d1e2f6-d349-4628-ab8d-1b73922668f2';

// En local se usa el backend de desarrollo. En producción, la API de Railway.
const API_BASE = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:4000/api'
  : 'https://turnosapp-production-10c4.up.railway.app/api';

// Lo único que sigue siendo "de este navegador, sin login": qué turno tomó
// esta persona en cada fecha, para poder mostrarle su propia tarjeta de
// seguimiento sin pedirle que inicie sesión.
const MY_TURNS_KEY = 'beatifullnails_mis_turnos';
const OWNER_TOKEN_KEY = 'beatifullnails_owner_token';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const SCHEDULE_EDIT_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun..Dom, para el modal de horario semanal
