/*
 * BEATIFULL NAILS — Comunicación con el backend
 *
 * Reemplaza a apiGet/apiPost (que armaban ?action=... contra Apps Script).
 * Ahora cada función de acá llama a una URL REST del nuevo backend. app.js
 * nunca debe llamar a fetch() directamente: siempre pasa por acá, así el
 * día que algo de la comunicación cambie (headers, formato de error, etc.)
 * se toca en un solo lugar.
 */

function tokenDueña() {
  try { return sessionStorage.getItem(OWNER_TOKEN_KEY) || null; } catch (e) { return null; }
}

async function peticion(path, opciones = {}) {
  const token = tokenDueña();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, { ...opciones, headers, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data && data.error === 'no_autorizado') {
      // Se maneja de forma centralizada en app.js (exitOwnerMode), acá solo
      // se deja pasar el error con su forma reconocible.
      const err = new Error(data.message || 'Sesión de dueña expirada.');
      err.noAutorizado = true;
      throw err;
    }
    throw new Error((data && data.message) || 'No se pudo conectar con el servidor.');
  }
  return data;
}

const api = {
  // ---------- Horarios ----------
  proximosDias: (cantidad = 10, desde = null) =>
    peticion(`/horarios/dias?cantidad=${cantidad}` + (desde ? `&desde=${desde}` : '')),
  horarioSemanal: () => peticion('/horarios/semanal'),
  guardarHorarioSemanal: (dias) =>
    peticion('/horarios/semanal', { method: 'PUT', body: JSON.stringify({ dias }) }),
  disponibilidadDia: (fecha) => peticion(`/horarios/${fecha}`),
  cerrarFecha: (fecha, cerrado) =>
    peticion(`/horarios/${fecha}/cierre`, { method: 'PUT', body: JSON.stringify({ cerrado }) }),
  quitarCierre: (fecha) => peticion(`/horarios/${fecha}/cierre`, { method: 'DELETE' }),
  guardarConfiguracionDia: (fecha, config) =>
    peticion(`/horarios/${fecha}/configuracion`, { method: 'PUT', body: JSON.stringify(config) }),
  quitarHorarioExacto: (fecha) => peticion(`/horarios/${fecha}/horarios-exactos`, { method: 'DELETE' }),

  // ---------- Servicios ----------
  servicios: () => peticion('/servicios'),

  // ---------- Turnos ----------
  crearTurno: (datos) => peticion('/turnos', { method: 'POST', body: JSON.stringify(datos) }),
  turnosDelDia: (fecha) => peticion(`/turnos/${fecha}`),
  turno: (id) => peticion(`/turnos/uno/${id}`),
  cambiarHoraTurno: (id, hora) =>
    peticion(`/turnos/${id}/hora`, { method: 'PATCH', body: JSON.stringify({ hora }) }),
  alternarAtendido: (id) => peticion(`/turnos/${id}/atendido`, { method: 'PATCH' }),
  aprobarTurno: (id) => peticion(`/turnos/${id}/aprobar`, { method: 'PATCH' }),
  rechazarTurno: (id) => peticion(`/turnos/${id}/rechazar`, { method: 'PATCH' }),
  eliminarTurno: (id) => peticion(`/turnos/${id}`, { method: 'DELETE' }),
  vaciarDia: (fecha) => peticion(`/turnos/dia/${fecha}`, { method: 'DELETE' }),
  historial: () => peticion('/turnos/reportes/historial'),
  limpiarAntiguos: () => peticion('/turnos/reportes/limpiar', { method: 'POST' }),
  guardarNotificacion: (id, playerId) =>
    peticion(`/turnos/${id}/notificaciones`, { method: 'POST', body: JSON.stringify({ playerId }) }),

  // ---------- Pagos ----------
  configPagos: () => peticion('/pagos/config'),
  crearIntentoPago: (turnoId) =>
    peticion('/pagos/crear-intento', { method: 'POST', body: JSON.stringify({ turnoId }) }),

  // ---------- Sesión de la dueña ----------
  loginOwner: (pin) => peticion('/owner/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  verificarOwner: () => peticion('/owner/verificar')
};
