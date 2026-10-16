/*
 * BEATIFULL NAILS — Configuración del frontend
 *
 * Antes este archivo también tenía la capacidad por defecto, el horario
 * semanal y el catálogo de servicios. Todo eso ahora vive en el backend
 * (es la fuente de verdad real, compartida entre todos los dispositivos),
 * así que acá solo queda lo que de verdad es propio de este navegador o
 * puramente decorativo/de formato.
 */

const ONESIGNAL_APP_ID = 'c6d1e2f6-d349-4628-ab8d-1b73922668f2';

// URL del backend. Si abres la página desde tu computador usa el servidor
// local; si está publicada en internet usa el servidor de Railway.
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
