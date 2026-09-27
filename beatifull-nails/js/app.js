/*
 * BEATIFULL NAILS — Interfaz
 *
 * Mismo comportamiento que la versión anterior (fila por día, horarios
 * exactos u opcionales, modo dueño, calendario, historial), pero ahora
 * todo lo que antes vivía en localStorage (horario semanal, cierres de
 * día, capacidad, horarios exactos) se pide y se guarda en el backend —
 * así cualquier dispositivo ve exactamente lo mismo.
 *
 * Cambios de fondo respecto a la versión anterior, para que quede anotado:
 *  - Simplifiqué el cacheo agresivo por fecha (dateCache + firmas +
 *    bloqueo por fecha) que existía para disimular la lentitud de Google
 *    Sheets. Con SQLite local las respuestas son casi instantáneas, así
 *    que ese nivel de optimización ya no hace falta; se conserva sí el
 *    esqueleto de carga y el refresco automático cada 15s.
 *  - "Horarios exactos" ahora se configura siempre POR FECHA puntual (ya
 *    no existe la opción de guardarlo como "plantilla semanal" que tenía
 *    el backend de Apps Script). Si hace falta esa plantilla, la sumamos
 *    después.
 *  - La limpieza automática de días viejos (más de 7 días) todavía no
 *    tiene endpoint en el backend nuevo, así que el botón correspondiente
 *    se sacó del historial por ahora.
 */

(function () {
  // ---------- Estado general ----------
  let ownerToken = null;
  try { ownerToken = sessionStorage.getItem(OWNER_TOKEN_KEY) || null; } catch (e) {}
  let ownerMode = !!ownerToken;

  let selectedDate = null;
  let selectedHour = null;
  let currentQueue = [];
  let diaActual = null; // última respuesta de api.disponibilidadDia() para selectedDate

  let CATALOGO_SERVICIOS = [];
  let selectedServices = [];
  let modalSelectionIds = new Set();

  let horarioSemanalCache = null; // [{diaSemana, abierto, horaInicio, horaFin}, ...]
  let metodoPagoSeleccionado = null; // 'linea' | 'efectivo'
  let turnoPendienteDePago = null; // el turno recién creado, mientras se paga en línea

  let stripeInstance = null;
  let stripeElements = null;
  let stripeCardElement = null;
  let stripeListo = false;
  let stripePreparacion = null;

  const togglesInFlight = new Set(); // ids de turnos con una acción en curso (evita doble click)

  // ---------- Utilidades de fecha y formato ----------
  function fmtDateKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function dateKey(d) { return fmtDateKey(d); }

  function fmt12h(hhmm) {
    if (!hhmm) return '';
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const m = (mStr || '00').padStart(2, '0');
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m}${ampm}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatCOP(n) {
    const num = Number(n) || 0;
    const abs = Math.abs(num);
    return (num < 0 ? '-$' : '$') + abs.toLocaleString('es-CO');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  function clockCountdownLabel(dateStr, hhmm) {
    if (!hhmm) return null;
    const target = new Date(dateStr + 'T' + hhmm + ':00');
    const diffMin = Math.round((target - new Date()) / 60000);
    if (diffMin <= 0) return null;
    if (diffMin < 60) return `~${diffMin} min`;
    const h = Math.floor(diffMin / 60);
    const rem = diffMin % 60;
    return rem === 0 ? `~${h} h` : `~${h} h ${rem} min`;
  }

  function getEffectiveHora(turno) { return turno.hora || null; }

  // Estados que ocupan un cupo/hora y se muestran en la fila. "rechazado"
  // y "cancelado" liberan el horario y no tiene sentido seguir listándolos.
  const ESTADOS_VISIBLES = ['pendiente_pago', 'pendiente_aprobacion', 'confirmado', 'completado'];

  // ---------- Sesión de la dueña ----------
  function guardarTokenOwner(token) {
    ownerToken = token;
    try { sessionStorage.setItem(OWNER_TOKEN_KEY, token); } catch (e) {}
  }
  function borrarTokenOwner() {
    ownerToken = null;
    try { sessionStorage.removeItem(OWNER_TOKEN_KEY); } catch (e) {}
  }

  function setOwnerMode(on) {
    ownerMode = on;
    const btn = document.getElementById('ownerToggle');
    btn.textContent = on ? '🔓 Modo dueño activo' : '🔒 Acceso dueño';
    btn.classList.toggle('on', on);
    document.getElementById('historyBtn').style.display = on ? 'inline-flex' : 'none';
    document.getElementById('scheduleBtn').style.display = on ? 'inline-flex' : 'none';
    document.getElementById('editCapacityBtn').style.display = on ? 'inline-flex' : 'none';
    document.getElementById('closeDayBtn').style.display = on ? 'inline-flex' : 'none';
    updateCloseDayBtn();
    loadQueue();
  }

  function exitOwnerMode(msg) {
    borrarTokenOwner();
    setOwnerMode(false);
    if (msg) showToast(msg);
  }

  // ---------- "Mi turno" (seguimiento por cliente, en este navegador) ----------
  function loadMyTurnsMap() {
    try {
      const raw = localStorage.getItem(MY_TURNS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }
  function saveMyTurn(dateStr, id, name, phone) {
    try {
      const map = loadMyTurnsMap();
      map[dateStr] = { id, name, phone, notifyRequested: false };
      localStorage.setItem(MY_TURNS_KEY, JSON.stringify(map));
    } catch (e) {}
  }
  function markNotifyRequested(dateStr) {
    try {
      const map = loadMyTurnsMap();
      if (map[dateStr]) { map[dateStr].notifyRequested = true; localStorage.setItem(MY_TURNS_KEY, JSON.stringify(map)); }
    } catch (e) {}
  }
  function getMyTurnForDate(dateStr) { return loadMyTurnsMap()[dateStr] || null; }
  function clearMyTurnForDate(dateStr) {
    try { const map = loadMyTurnsMap(); delete map[dateStr]; localStorage.setItem(MY_TURNS_KEY, JSON.stringify(map)); } catch (e) {}
  }

  function updateMyTurnCard() {
    const card = document.getElementById('myTurnCard');
    const numEl = document.getElementById('myTurnNum');
    const statusEl = document.getElementById('myTurnStatus');
    const notifyBtn = document.getElementById('notifyMeBtn');
    const dateStrMy = dateKey(selectedDate);
    const saved = getMyTurnForDate(dateStrMy);
    if (!saved) { card.style.display = 'none'; return; }

    const idx = currentQueue.findIndex(q => q.id === saved.id);
    if (idx === -1) { card.style.display = 'none'; clearMyTurnForDate(dateStrMy); return; }

    const ticket = currentQueue[idx];
    const assignedSlot = getEffectiveHora(ticket);

    if (ticket.estado === 'pendiente_aprobacion') {
      numEl.textContent = '⏳';
      statusEl.textContent = 'Esperando que la dueña confirme tu pago en efectivo.';
      card.style.display = 'block';
      notifyBtn.style.display = 'none';
      return;
    }
    if (ticket.estado === 'pendiente_pago') {
      numEl.textContent = '⏳';
      statusEl.textContent = 'Completa el pago para confirmar tu turno.';
      card.style.display = 'block';
      notifyBtn.style.display = 'none';
      return;
    }

    numEl.textContent = assignedSlot ? fmt12h(assignedSlot) : '#' + (idx + 1);
    if (ticket.estado === 'completado') {
      statusEl.textContent = '✅ Ya fuiste atendido. ¡Gracias por tu visita!';
      card.style.display = 'block';
      notifyBtn.style.display = 'none';
      return;
    }
    const activeBefore = currentQueue.slice(0, idx).filter(q => q.estado !== 'completado').length;
    if (assignedSlot) {
      const countdown = clockCountdownLabel(dateStrMy, assignedSlot);
      statusEl.textContent = countdown
        ? `Tu turno es a las ${fmt12h(assignedSlot)} (${countdown})`
        : (activeBefore === 0 ? '🎉 ¡Es tu turno! Acércate al salón.' : `Tu turno es a las ${fmt12h(assignedSlot)}.`);
    } else {
      const waitLabel = diaActual && diaActual.modo === 'capacidad' ? diaActual.esperaEstimada : null;
      const waitSuffix = waitLabel ? ` (${waitLabel})` : '';
      if (activeBefore === 0) statusEl.textContent = '🎉 ¡Es tu turno! Acércate al salón.';
      else if (activeBefore <= 2) statusEl.textContent = `🔥 ¡Ya casi! Falta${activeBefore === 1 ? '' : 'n'} ${activeBefore} turno${activeBefore === 1 ? '' : 's'} para el tuyo${waitSuffix}.`;
      else statusEl.textContent = `Faltan ${activeBefore} turnos para el tuyo${waitSuffix}.`;
    }
    card.style.display = 'block';
    const pushDisponible = ONESIGNAL_APP_ID && ONESIGNAL_APP_ID.indexOf('TU_ONESIGNAL') !== 0;
    notifyBtn.style.display = (pushDisponible && !saved.notifyRequested) ? 'inline-flex' : 'none';
  }

  // ---------- Pestañas de día ----------
  async function buildDayTabs() {
    const wrap = document.getElementById('dayTabs');
    let dias;
    try { dias = await api.proximosDias(10); }
    catch (e) { wrap.innerHTML = '<span style="font-size:12px;color:var(--off-dim);">No se pudo conectar con el servidor.</span>'; return; }

    wrap.innerHTML = dias.map((d, i) => {
      const fecha = new Date(d.fecha + 'T00:00:00');
      const label = i === 0 ? 'Hoy' : DIAS_CORTOS[fecha.getDay()] + ' ' + fecha.getDate();
      return `<button type="button" class="day-btn${!d.abierto ? ' closed' : ''}" data-fecha="${d.fecha}">${label}</button>`;
    }).join('');

    wrap.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => selectDate(new Date(btn.dataset.fecha + 'T00:00:00')));
    });

    if (!selectedDate) selectDate(new Date(dias[0].fecha + 'T00:00:00'));
    else refreshDayTabsActive();
  }

  function refreshDayTabsActive() {
    const activo = dateKey(selectedDate);
    document.querySelectorAll('#dayTabs .day-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.fecha === activo);
    });
  }

  // ---------- Selección de fecha ----------
  async function selectDate(date) {
    selectedDate = date;
    selectedHour = null;
    refreshDayTabsActive();
    document.getElementById('selectedDateLabel').textContent =
      `${DIAS_SEMANA[date.getDay()]} ${date.getDate()} de ${MESES[date.getMonth()].toLowerCase()}`;

    const fecha = dateKey(date);
    try {
      diaActual = await api.disponibilidadDia(fecha);
    } catch (e) {
      diaActual = { abierto: false };
      showToast('No se pudo consultar ese día.');
    }

    const cerrado = !diaActual.abierto;
    document.getElementById('closedMsg').style.display = cerrado ? 'block' : 'none';
    document.getElementById('mainContent').style.display = cerrado ? 'none' : 'block';
    updateCloseDayBtn();
    if (!cerrado) loadQueue();
  }

  function updateCloseDayBtn() {
    const btn = document.getElementById('closeDayBtn');
    if (!btn || !selectedDate || !diaActual) return;
    btn.textContent = diaActual.abierto ? '🚫 Cerrar este día' : '✅ Abrir este día';
  }

  document.getElementById('closeDayBtn').addEventListener('click', async () => {
    if (!ownerMode || !selectedDate) return;
    const fecha = dateKey(selectedDate);
    try {
      if (diaActual.abierto) {
        await api.cerrarFecha(fecha, true);
        showToast('Día cerrado. Los clientes no van a poder tomar turno.');
      } else {
        const weeklyOpen = horarioSemanalCache && horarioSemanalCache[selectedDate.getDay()].abierto;
        if (weeklyOpen) await api.quitarCierre(fecha);
        else await api.cerrarFecha(fecha, false);
        showToast('Día abierto de nuevo.');
      }
      await buildDayTabs();
      await selectDate(selectedDate);
    } catch (e) {
      showToast(e.message);
    }
  });

  // ---------- Horario semanal (encabezado + modal) ----------
  async function cargarHorarioSemanal() {
    horarioSemanalCache = await api.horarioSemanal();
    updateHoursLine();
  }

  function updateHoursLine() {
    const el = document.getElementById('hoursLine');
    if (!el || !horarioSemanalCache) return;
    const hoy = new Date();
    const info = horarioSemanalCache[hoy.getDay()];
    el.textContent = info.abierto
      ? `Hoy ${DIAS_CORTOS[hoy.getDay()]} · ${fmt12h(info.horaInicio)}–${fmt12h(info.horaFin)}`
      : 'Hoy cerrado · mirá el calendario para ver los próximos días';
  }

  function openScheduleModal() {
    const rowsEl = document.getElementById('scheduleRows');
    rowsEl.innerHTML = SCHEDULE_EDIT_ORDER.map(dow => {
      const info = horarioSemanalCache[dow];
      return `
        <div class="schedule-row ${info.abierto ? '' : 'is-closed'}" data-dow="${dow}">
          <label class="schedule-day-toggle">
            <input type="checkbox" class="sched-open" ${info.abierto ? 'checked' : ''}>
            <span>${DIAS_SEMANA[dow]}</span>
          </label>
          <div class="schedule-row-times">
            <input type="time" class="sched-start" value="${info.horaInicio}">
            <span>a</span>
            <input type="time" class="sched-end" value="${info.horaFin}">
          </div>
        </div>`;
    }).join('');
    rowsEl.querySelectorAll('.sched-open').forEach(chk => {
      chk.addEventListener('change', () => chk.closest('.schedule-row').classList.toggle('is-closed', !chk.checked));
    });
    document.getElementById('scheduleModal').classList.add('show');
  }

  document.getElementById('scheduleBtn').addEventListener('click', () => { if (ownerMode) openScheduleModal(); });
  document.getElementById('scheduleCancel').addEventListener('click', () => document.getElementById('scheduleModal').classList.remove('show'));

  document.getElementById('scheduleSave').addEventListener('click', async () => {
    if (!ownerMode) return;
    const filas = document.querySelectorAll('#scheduleRows .schedule-row');
    const dias = [];
    let valido = true;
    filas.forEach(row => {
      const diaSemana = parseInt(row.dataset.dow, 10);
      const abierto = row.querySelector('.sched-open').checked;
      const horaInicio = row.querySelector('.sched-start').value || '08:00';
      const horaFin = row.querySelector('.sched-end').value || '17:00';
      if (abierto && horaInicio >= horaFin) valido = false;
      dias.push({ diaSemana, abierto, horaInicio, horaFin });
    });
    if (!valido) { showToast('Revisá los horarios: la hora de cierre debe ser después de la de apertura.'); return; }
    try {
      await api.guardarHorarioSemanal(dias);
      await cargarHorarioSemanal();
      document.getElementById('scheduleModal').classList.remove('show');
      showToast('Horario actualizado.');
      await buildDayTabs();
      await selectDate(selectedDate);
    } catch (e) { showToast(e.message); }
  });

  // ---------- Calendario completo ----------
  const calendarModal = document.getElementById('calendarModal');
  let calViewDate = new Date();
  let calDiasAbiertos = {};

  async function openCalendar() {
    calViewDate = selectedDate ? new Date(selectedDate) : new Date();
    calViewDate.setDate(1);
    await renderCalendarGrid();
    calendarModal.classList.add('show');
  }

  async function renderCalendarGrid() {
    document.getElementById('calMonthLabel').textContent = `${MESES[calViewDate.getMonth()]} ${calViewDate.getFullYear()}`;
    document.getElementById('calWeekdays').innerHTML = DIAS_CORTOS.map(d => `<div>${d}</div>`).join('');

    const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    try {
      const inicioMes = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const dias = await api.proximosDias(daysInMonth, inicioMes);
      calDiasAbiertos = {};
      dias.forEach(d => { calDiasAbiertos[d.fecha] = d.abierto; });
    } catch (e) { calDiasAbiertos = {}; }

    const gridEl = document.getElementById('calGrid');
    gridEl.innerHTML = '';
    for (let i = 0; i < firstDow; i++) gridEl.appendChild(document.createElement('div'));

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const clave = fmtDateKey(d);
      const abierto = calDiasAbiertos[clave] !== false;
      const isPast = d < hoy;
      const bloqueadoParaCliente = isPast && !ownerMode;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-btn' + (!abierto ? ' closed' : '');
      if (selectedDate && clave === dateKey(selectedDate)) btn.classList.add('active');
      btn.style.padding = '10px 0'; btn.style.width = '100%';
      btn.textContent = String(day);
      if (bloqueadoParaCliente) { btn.disabled = true; btn.classList.add('closed'); }
      else btn.addEventListener('click', () => { calendarModal.classList.remove('show'); selectDate(d); });
      gridEl.appendChild(btn);
    }
  }

  document.getElementById('calendarBtn').addEventListener('click', openCalendar);
  document.getElementById('calClose').addEventListener('click', () => calendarModal.classList.remove('show'));
  document.getElementById('calPrevMonth').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() - 1); renderCalendarGrid(); });
  document.getElementById('calNextMonth').addEventListener('click', () => { calViewDate.setMonth(calViewDate.getMonth() + 1); renderCalendarGrid(); });

  // ---------- Selector de horas exactas (formulario de reserva) ----------
  function renderHourPicker() {
    const section = document.getElementById('hourPickerSection');
    const chipsEl = document.getElementById('hourPickerChips');
    if (!diaActual || diaActual.modo !== 'horarios_exactos') {
      section.style.display = 'none';
      selectedHour = null;
      return;
    }
    section.style.display = 'block';
    if (selectedHour) {
      const slot = diaActual.horas.find(h => h.hora === selectedHour);
      if (!slot || !slot.libre) selectedHour = null;
    }
    chipsEl.innerHTML = diaActual.horas.map(h => {
      const isSel = h.hora === selectedHour;
      const cls = isSel ? 'hour-chip selected' : (h.libre ? 'hour-chip' : 'hour-chip occupied');
      return `<button type="button" class="${cls}" data-time="${h.hora}" ${h.libre ? '' : 'disabled'}>${isSel ? '✓ ' : (h.libre ? '🟢 ' : '🔴 ')}${fmt12h(h.hora)}</button>`;
    }).join('');
  }

  document.getElementById('hourPickerChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.hour-chip');
    if (!btn || btn.disabled) return;
    selectedHour = btn.dataset.time;
    renderHourPicker();
  });

  // ---------- Cargar y pintar la fila del día ----------
  function showQueueSkeleton() {
    let rows = '';
    for (let i = 0; i < 3; i++) {
      rows += `<div class="skel-ticket"><div class="skel skel-num"></div><div class="skel-lines"><div class="skel skel-line1"></div><div class="skel skel-line2"></div></div></div>`;
    }
    document.getElementById('queueItems').innerHTML = rows;
  }

  async function loadQueue() {
    if (!selectedDate) return;
    const fecha = dateKey(selectedDate);
    showQueueSkeleton();
    try {
      const [disponibilidad, turnos] = await Promise.all([api.disponibilidadDia(fecha), api.turnosDelDia(fecha)]);
      if (dateKey(selectedDate) !== fecha) return; // el usuario ya cambió de fecha mientras esperábamos
      diaActual = disponibilidad;
      currentQueue = turnos.filter(t => ESTADOS_VISIBLES.includes(t.estado));
      renderQueue();
    } catch (e) {
      if (e.noAutorizado) { exitOwnerMode(e.message); return; }
      currentQueue = [];
      renderQueue();
      showToast('No se pudo conectar con el servidor.');
    }
  }

  const expandedDescIds = new Set();

  function renderQueue() {
    const cap = diaActual.modo === 'horarios_exactos' ? diaActual.horas.length : diaActual.capacidad;
    const activos = currentQueue.filter(q => q.estado !== 'completado');
    document.getElementById('queueCount').innerHTML = activos.length + '<span>/' + cap + '</span>';

    const nextNumEl = document.getElementById('nextNum');
    const full = diaActual.modo === 'capacidad' ? !diaActual.hayCupo : activos.length >= cap;
    if (full) {
      nextNumEl.textContent = 'Fila completa';
    } else if (diaActual.modo === 'horarios_exactos') {
      const ocupadas = new Set(currentQueue.map(getEffectiveHora).filter(Boolean));
      const libre = diaActual.horas.find(h => !ocupadas.has(h.hora));
      nextNumEl.textContent = libre ? 'Próximo horario libre: ' + fmt12h(libre.hora) : 'Fila completa';
    } else {
      nextNumEl.textContent = 'Turno #' + (currentQueue.length + 1) + ' libre';
    }

    document.getElementById('fullMsg').textContent = diaActual.modo === 'horarios_exactos'
      ? `Ya se completaron los ${cap} horarios de este día. Probá con otra fecha.`
      : `Ya se completaron los ${cap} turnos de este día. Probá con otra fecha.`;
    document.getElementById('fullMsg').style.display = full ? 'block' : 'none';
    document.getElementById('formCard').style.display = full ? 'none' : 'block';

    updateMyTurnCard();
    renderHourPicker();

    const listEl = document.getElementById('queueItems');
    listEl.innerHTML = '';
    if (currentQueue.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-note';
      empty.textContent = 'Todavía no hay nadie en la fila.';
      listEl.appendChild(empty);
      return;
    }

    const currentIds = new Set(currentQueue.map(q => q.id));
    expandedDescIds.forEach(id => { if (!currentIds.has(id)) expandedDescIds.delete(id); });

    currentQueue.forEach((q, idx) => {
      const t = document.createElement('div');
      t.className = 'ticket' + (q.estado === 'completado' ? ' done' : '') + (ownerMode ? '' : ' locked');
      const phoneStr = q.clienteTelefono || '';
      const nameStr = q.clienteNombre || '';

      let waitHtml = '';
      if (diaActual.modo === 'horarios_exactos') {
        const assigned = getEffectiveHora(q);
        if (assigned) {
          waitHtml = q.estado === 'completado'
            ? `<small class="wait-estimate">Atendido a las ${fmt12h(assigned)}</small>`
            : `<small class="wait-estimate">🕐 ${fmt12h(assigned)}${clockCountdownLabel(dateKey(selectedDate), assigned) ? ' · ' + clockCountdownLabel(dateKey(selectedDate), assigned) : ''}</small>`;
        }
      }

      let badgeHtml;
      if (q.estado === 'pendiente_aprobacion') {
        badgeHtml = `<div class="badge pendiente-aprobacion">Efectivo: por aprobar</div>`;
      } else if (q.estado === 'pendiente_pago') {
        badgeHtml = `<div class="badge pendiente-aprobacion">Esperando pago</div>`;
      } else if (ownerMode) {
        badgeHtml = `<div class="badge ${q.estado === 'completado' ? '' : 'pending'}" data-idx="${idx}">${q.estado === 'completado' ? 'Atendido' : 'Marcar listo'}</div>`;
      } else {
        badgeHtml = `<div class="badge ${q.estado === 'completado' ? '' : 'pending'}" style="cursor:default;">${q.estado === 'completado' ? '✓ Atendido' : '⏳ Esperando'}</div>`;
      }

      const aprobacionHtml = (ownerMode && q.estado === 'pendiente_aprobacion')
        ? `<div class="approval-actions"><button type="button" class="aprobar-btn" data-idx="${idx}">✅ Aprobar</button><button type="button" class="rechazar-btn" data-idx="${idx}">❌ Rechazar</button></div>`
        : '';

      const callBtn = (ownerMode && phoneStr) ? `<a class="call-btn" href="tel:${escapeHtml(phoneStr.replace(/[^0-9+]/g, ''))}" title="Llamar a ${escapeHtml(nameStr)}">📞</a>` : '';
      let waBtn = '';
      if (ownerMode && phoneStr) {
        let waNumber = phoneStr.replace(/[^0-9]/g, '');
        if (waNumber.length === 10) waNumber = '57' + waNumber;
        const waMsg = encodeURIComponent(`Hola ${nameStr}, te escribimos de Beatifull Nails: ya casi es tu turno 💅`);
        waBtn = `<a class="wa-btn" href="https://wa.me/${waNumber}?text=${waMsg}" target="_blank" title="WhatsApp a ${escapeHtml(nameStr)}">💬</a>`;
      }
      const changeHourBtn = (ownerMode && diaActual.modo === 'horarios_exactos' && q.estado !== 'completado')
        ? `<button type="button" class="hour-btn changehour-btn" data-idx="${idx}" title="Cambiar hora de ${escapeHtml(nameStr)}">🕐</button>` : '';
      const deleteCitaBtn = (ownerMode && q.estado !== 'completado')
        ? `<button type="button" class="hour-btn deletecita-btn" data-idx="${idx}" title="Eliminar cita de ${escapeHtml(nameStr)}">🗑</button>` : '';
      const nameMain = ownerMode ? escapeHtml(nameStr) : (q.estado === 'completado' ? 'Atendido' : 'Esperando turno');
      const iconsHtml = (callBtn || waBtn || changeHourBtn || deleteCitaBtn) ? `<div class="ticons">${callBtn}${waBtn}${changeHourBtn}${deleteCitaBtn}</div>` : '';
      const subHtml = (ownerMode && phoneStr) || waitHtml
        ? `<div class="tsub">${ownerMode && phoneStr ? `<span class="tphone">📱 ${escapeHtml(phoneStr)}</span>` : ''}${waitHtml}</div>` : '';

      const serviciosArr = Array.isArray(q.servicios) ? q.servicios : [];
      const serviciosBoxHtml = serviciosArr.length
        ? `<div class="desc-box-label">Servicios seleccionados</div>
           <ul class="service-summary-list">${serviciosArr.map(s => `<li${s.precio < 0 ? ' class="is-discount"' : ''}><span>${escapeHtml(s.nombre)}</span><span>${formatCOP(s.precio)}</span></li>`).join('')}</ul>
           <div class="service-summary-total"><span>Total</span><span>${formatCOP(q.total)}</span></div>` : '';
      const hasDesc = ownerMode && serviciosArr.length > 0;
      const descIsOpen = hasDesc && expandedDescIds.has(q.id);
      const descHtml = hasDesc
        ? `<button type="button" class="desc-toggle${descIsOpen ? ' is-open' : ''}" data-idx="${idx}"><span class="desc-toggle-label">${descIsOpen ? 'Ocultar' : 'Ver más'}</span><span class="desc-toggle-chevron">›</span></button>
           <div class="desc-box${descIsOpen ? ' open' : ''}" data-idx="${idx}"><div class="desc-box-inner">${serviciosBoxHtml}</div></div>` : '';

      t.innerHTML = `
        <div class="trow">
          <div class="tnum">#${idx + 1}</div>
          <div class="tbody">
            <div class="tmain"><span class="tname-main">${nameMain}</span>${iconsHtml}</div>
            ${subHtml}
            ${descHtml}
          </div>
        </div>
        <div class="tbadge">${badgeHtml}${aprobacionHtml}</div>`;
      listEl.appendChild(t);
    });
  }

  // ---------- Acciones sobre un turno (delegadas en el contenedor) ----------
  document.getElementById('queueItems').addEventListener('click', async (e) => {
    const descToggleEl = e.target.closest('.desc-toggle');
    if (descToggleEl) {
      const idx = descToggleEl.dataset.idx;
      const box = document.querySelector(`.desc-box[data-idx="${idx}"]`);
      const item = currentQueue[idx];
      if (item) { if (expandedDescIds.has(item.id)) expandedDescIds.delete(item.id); else expandedDescIds.add(item.id); }
      if (box) box.classList.toggle('open');
      descToggleEl.classList.toggle('is-open');
      descToggleEl.querySelector('.desc-toggle-label').textContent = descToggleEl.classList.contains('is-open') ? 'Ocultar' : 'Ver más';
      return;
    }

    const aprobarBtn = e.target.closest('.aprobar-btn');
    const rechazarBtn = e.target.closest('.rechazar-btn');
    if ((aprobarBtn || rechazarBtn) && ownerMode) {
      const idx = parseInt((aprobarBtn || rechazarBtn).dataset.idx, 10);
      const item = currentQueue[idx];
      if (!item || togglesInFlight.has(item.id)) return;
      togglesInFlight.add(item.id);
      try {
        if (aprobarBtn) { await api.aprobarTurno(item.id); showToast('✓ Turno aprobado.'); }
        else { await api.rechazarTurno(item.id); showToast('Turno rechazado, el horario quedó libre.'); }
        await loadQueue();
      } catch (err) {
        if (err.noAutorizado) exitOwnerMode(err.message);
        else showToast(err.message);
      }
      togglesInFlight.delete(item.id);
      return;
    }

    const changeHourBtn = e.target.closest('.changehour-btn');
    if (changeHourBtn && ownerMode) { openChangeHourModal(parseInt(changeHourBtn.dataset.idx, 10)); return; }

    const deleteBtn = e.target.closest('.deletecita-btn');
    if (deleteBtn && ownerMode) {
      const idx = parseInt(deleteBtn.dataset.idx, 10);
      const item = currentQueue[idx];
      if (!item || togglesInFlight.has(item.id)) return;
      const quien = item.clienteNombre ? ` de ${item.clienteNombre}` : '';
      if (!confirm(`¿Seguro que deseas cancelar/eliminar esta cita${quien}? Esta acción no se puede deshacer.`)) return;
      togglesInFlight.add(item.id);
      deleteBtn.disabled = true;
      try { await api.eliminarTurno(item.id); showToast('Cita eliminada.'); await loadQueue(); }
      catch (err) { showToast(err.noAutorizado ? err.message : (err.message || 'No se pudo eliminar la cita.')); if (err.noAutorizado) exitOwnerMode(err.message); }
      togglesInFlight.delete(item.id);
      return;
    }

    const badge = e.target.closest('.badge[data-idx]');
    if (badge && ownerMode) {
      const idx = parseInt(badge.dataset.idx, 10);
      const item = currentQueue[idx];
      if (!item || togglesInFlight.has(item.id)) return;
      togglesInFlight.add(item.id);
      try { await api.alternarAtendido(item.id); await loadQueue(); }
      catch (err) { showToast(err.noAutorizado ? err.message : 'No se pudo actualizar.'); if (err.noAutorizado) exitOwnerMode(err.message); }
      togglesInFlight.delete(item.id);
    }
  });

  // ---------- Cambiar hora (modal, solo dueña) ----------
  const changeHourModal = document.getElementById('changeHourModal');
  const changeHourChipsEl = document.getElementById('changeHourChips');
  let changeHourTargetId = null;

  function openChangeHourModal(idx) {
    const item = currentQueue[idx];
    if (!item) return;
    changeHourTargetId = item.id;
    document.getElementById('changeHourClientLabel').textContent = item.hora
      ? `${item.clienteNombre} — hora actual: ${fmt12h(item.hora)}`
      : `${item.clienteNombre} — todavía sin hora asignada`;
    if (diaActual.modo !== 'horarios_exactos') {
      changeHourChipsEl.innerHTML = '<span style="font-size:11px;color:var(--off-dim);">Este día no tiene horarios exactos configurados.</span>';
    } else {
      changeHourChipsEl.innerHTML = diaActual.horas.map(h => {
        const isCurrent = h.hora === item.hora;
        const isOcc = !h.libre && !isCurrent;
        const cls = isCurrent ? 'hour-chip selected' : (isOcc ? 'hour-chip occupied' : 'hour-chip');
        return `<button type="button" class="${cls}" data-time="${h.hora}" ${(isOcc || isCurrent) ? 'disabled' : ''}>${isCurrent ? '● ' : (isOcc ? '🔴 ' : '🟢 ')}${fmt12h(h.hora)}</button>`;
      }).join('');
    }
    changeHourModal.classList.add('show');
  }

  changeHourChipsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.hour-chip');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    try {
      await api.cambiarHoraTurno(changeHourTargetId, btn.dataset.time);
      changeHourModal.classList.remove('show');
      showToast('✓ Hora actualizada.');
      await loadQueue();
    } catch (err) { showToast(err.message); btn.disabled = false; }
  });
  document.getElementById('changeHourCancel').addEventListener('click', () => changeHourModal.classList.remove('show'));

  // ---------- Configuración de un día (capacidad / horarios exactos) ----------
  const capacityModal = document.getElementById('capacityModal');
  const capacityInput = document.getElementById('capacityInput');
  const slotsChipsEl = document.getElementById('slotsChips');
  const slotTimeInput = document.getElementById('slotTimeInput');
  let editingSlots = [];

  function renderSlotChips() {
    slotsChipsEl.innerHTML = editingSlots.length === 0
      ? '<div class="slots-empty-state">🕒 Todavía no cargaste horarios para este día.</div>'
      : editingSlots.map(t => `<span class="slot-chip">${fmt12h(t)}<button type="button" data-time="${t}" aria-label="Quitar">×</button></span>`).join('');
  }
  slotsChipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-time]');
    if (!btn) return;
    editingSlots = editingSlots.filter(t => t !== btn.dataset.time);
    renderSlotChips();
  });
  document.getElementById('addSlotBtn').addEventListener('click', () => {
    const val = slotTimeInput.value;
    if (!val) { showToast('Elegí una hora para agregar.'); return; }
    if (!editingSlots.includes(val)) { editingSlots.push(val); editingSlots.sort(); }
    slotTimeInput.value = '';
    renderSlotChips();
  });
  slotTimeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addSlotBtn').click(); } });

  const slotsEnabledToggle = document.getElementById('slotsEnabledToggle');
  const slotsSectionEl = document.getElementById('slotsSection');
  const slotsOverrideDayToggle = document.getElementById('slotsOverrideDayToggle');
  const overrideBanner = document.getElementById('overrideBanner');
  function applySlotsToggleVisual() { slotsSectionEl.classList.toggle('slots-disabled', !slotsEnabledToggle.checked); }
  slotsEnabledToggle.addEventListener('change', applySlotsToggleVisual);

  document.getElementById('removeOverrideBtn').addEventListener('click', async () => {
    try {
      await api.quitarHorarioExacto(dateKey(selectedDate));
      showToast('Excepción quitada, este día vuelve a usar el horario de siempre.');
      await selectDate(selectedDate);
      capacityModal.classList.remove('show');
    } catch (e) { showToast(e.message); }
  });

  document.getElementById('editCapacityBtn').addEventListener('click', () => {
    if (!ownerMode) return;
    document.getElementById('capacityDateLabel').textContent = `${DIAS_SEMANA[selectedDate.getDay()]} ${selectedDate.getDate()} de ${MESES[selectedDate.getMonth()].toLowerCase()}`;
    capacityInput.value = diaActual.modo === 'capacidad' ? diaActual.capacidad : 18;
    document.getElementById('minutesPerClientInput').value = 30;
    editingSlots = diaActual.modo === 'horarios_exactos' ? diaActual.horas.map(h => h.hora) : [];
    renderSlotChips();
    slotsEnabledToggle.checked = diaActual.modo === 'horarios_exactos';
    applySlotsToggleVisual();
    slotsOverrideDayToggle.checked = false;
    document.getElementById('slotsOverrideDayLabel').textContent = DIAS_SEMANA[selectedDate.getDay()].toLowerCase() + 's';
    overrideBanner.style.display = (diaActual.modo === 'horarios_exactos' && diaActual.horariosPropios) ? 'flex' : 'none';
    capacityModal.classList.add('show');
  });

  document.getElementById('capacityCancel').addEventListener('click', () => capacityModal.classList.remove('show'));

  document.getElementById('capacitySave').addEventListener('click', async () => {
    if (!ownerMode) return;
    const capacidad = parseInt(capacityInput.value, 10);
    const minutosPorCliente = parseInt(document.getElementById('minutesPerClientInput').value, 10);
    if (!Number.isFinite(capacidad) || capacidad < 1) { showToast('Ingresá un número válido de turnos.'); return; }
    if (!Number.isFinite(minutosPorCliente) || minutosPorCliente < 1) { showToast('Ingresá cuántos minutos por cliente, aproximadamente.'); return; }
    if (slotsEnabledToggle.checked && editingSlots.length === 0) { showToast('Activaste horarios exactos pero todavía no cargaste ninguna hora.'); return; }

    try {
      await api.guardarConfiguracionDia(dateKey(selectedDate), {
        capacidad, minutosPorCliente, usaHorariosExactos: slotsEnabledToggle.checked, horas: editingSlots,
        scope: slotsOverrideDayToggle.checked ? 'dia' : 'semana'
      });
      capacityModal.classList.remove('show');
      showToast(slotsEnabledToggle.checked ? `Horarios exactos activados (${editingSlots.length}).` : 'Usando cantidad + tiempo aproximado.');
      await selectDate(selectedDate);
    } catch (e) { showToast(e.message); }
  });

  // ---------- Servicios ----------
  function renderServicesSummary() {
    const chooseBtn = document.getElementById('chooseServicesBtn');
    const summaryBox = document.getElementById('servicesSummary');
    const summaryText = document.getElementById('servicesSummaryText');
    if (selectedServices.length === 0) {
      chooseBtn.style.display = '';
      summaryBox.style.display = 'none';
    } else {
      chooseBtn.style.display = 'none';
      summaryBox.style.display = 'block';
      const total = selectedServices.reduce((s, x) => s + x.precio, 0);
      summaryText.textContent = `Servicios seleccionados (${selectedServices.length}): ` + selectedServices.map(s => s.nombre).join(' · ') + ` — Total: ${formatCOP(total)}`;
    }
    actualizarEstadoBotonReservar();
  }

  function renderServicesModalList() {
    document.getElementById('servicesList').innerHTML = CATALOGO_SERVICIOS.map(s => {
      const sel = modalSelectionIds.has(s.id);
      return `<div class="service-row${sel ? ' selected' : ''}" data-id="${s.id}">
        <div class="service-row-info"><span class="service-row-name">${escapeHtml(s.nombre)}</span><span class="service-row-price">${formatCOP(s.precio)}</span></div>
        <button type="button" class="service-row-btn">${sel ? '✓ Elegido' : 'Seleccionar'}</button>
      </div>`;
    }).join('');
    const total = CATALOGO_SERVICIOS.filter(s => modalSelectionIds.has(s.id)).reduce((sum, s) => sum + s.precio, 0);
    document.getElementById('servicesModalTotal').textContent = formatCOP(total);
  }

  function openServicesModal() {
    modalSelectionIds = new Set(selectedServices.map(s => s.id));
    renderServicesModalList();
    document.getElementById('servicesModal').classList.add('show');
  }
  document.getElementById('chooseServicesBtn').addEventListener('click', openServicesModal);
  document.getElementById('changeServicesBtn').addEventListener('click', openServicesModal);
  document.getElementById('servicesModalCancel').addEventListener('click', () => document.getElementById('servicesModal').classList.remove('show'));
  document.getElementById('servicesList').addEventListener('click', (e) => {
    const row = e.target.closest('.service-row');
    if (!row) return;
    const id = row.dataset.id;
    if (modalSelectionIds.has(id)) modalSelectionIds.delete(id); else modalSelectionIds.add(id);
    renderServicesModalList();
  });
  document.getElementById('servicesModalConfirm').addEventListener('click', () => {
    selectedServices = CATALOGO_SERVICIOS.filter(s => modalSelectionIds.has(s.id));
    renderServicesSummary();
    document.getElementById('servicesModal').classList.remove('show');
  });

  document.getElementById('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText('3122763390').then(() => showToast('Número Nequi copiado.')).catch(() => showToast('312 276 3390'));
  });

  // ---------- Método de pago ----------
  document.getElementById('paymentMethodChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.payment-chip');
    if (!btn) return;
    metodoPagoSeleccionado = btn.dataset.metodo;
    document.querySelectorAll('.payment-chip').forEach(b => b.classList.toggle('selected', b === btn));
    const hint = document.getElementById('paymentMethodHint');
    hint.style.display = 'block';
    hint.textContent = metodoPagoSeleccionado === 'linea'
      ? 'Vas a pagar con tarjeta ahora mismo; tu turno queda confirmado al instante.'
      : 'La dueña revisa tu comprobante y confirma tu turno. Mientras tanto, tu horario ya queda reservado.';
    actualizarEstadoBotonReservar();
  });

  function actualizarEstadoBotonReservar() {
    document.getElementById('joinBtn').disabled = selectedServices.length === 0 || !metodoPagoSeleccionado;
  }

  // ---------- Tomar turno ----------
  document.getElementById('joinBtn').addEventListener('click', async () => {
    const nameEl = document.getElementById('nameInput');
    const phoneEl = document.getElementById('phoneInput');
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();

    if (!name) { showToast('Escribí tu nombre para tomar el turno.'); return; }
    if (!phone) { showToast('Escribí tu WhatsApp o celular.'); return; }
    if (selectedServices.length === 0) { showToast('Elegí al menos un servicio para tomar el turno.'); return; }
    if (!metodoPagoSeleccionado) { showToast('Elegí cómo vas a pagar.'); return; }
    if (diaActual.modo === 'horarios_exactos' && !selectedHour) { showToast('Selecciona una hora para tomar tu turno.'); return; }

    const joinBtn = document.getElementById('joinBtn');
    joinBtn.disabled = true;
    joinBtn.textContent = 'Reservando...';
    try {
      const turno = await api.crearTurno({
        fecha: dateKey(selectedDate),
        hora: selectedHour || null,
        clienteNombre: name,
        clienteTelefono: phone,
        servicios: selectedServices.map(s => s.id),
        metodoPago: metodoPagoSeleccionado
      });

      if (metodoPagoSeleccionado === 'efectivo') {
        finalizarReserva(turno, name, phone);
        showToast('✓ Reserva enviada. La dueña va a confirmar tu turno.');
      } else {
        turnoPendienteDePago = turno;
        document.getElementById('pagoLineaTotal').textContent = formatCOP(turno.total);
        document.getElementById('pagoLineaModal').classList.add('show');
        const payBtn = document.getElementById('pagoLineaConfirm');
        payBtn.disabled = true;
        payBtn.textContent = 'Cargando tarjeta...';
        const errBox = document.getElementById('stripeCardErrors');
        errBox.style.display = 'none';
        errBox.textContent = '';
        prepararStripe().catch(() => {}); // El error se muestra dentro del modal.
      }
    } catch (e) {
      showToast(e.message || 'Esa hora ya no está disponible. Elegí otra.');
      selectedHour = null;
      await loadQueue();
    }
    joinBtn.disabled = selectedServices.length === 0 || !metodoPagoSeleccionado;
    joinBtn.textContent = 'Tomar turno';
  });

  function finalizarReserva(turno, name, phone) {
    document.getElementById('nameInput').value = '';
    document.getElementById('phoneInput').value = '';
    document.getElementById('descInput').value = '';
    selectedHour = null;
    selectedServices = [];
    metodoPagoSeleccionado = null;
    document.querySelectorAll('.payment-chip').forEach(b => b.classList.remove('selected'));
    document.getElementById('paymentMethodHint').style.display = 'none';
    renderServicesSummary();
    saveMyTurn(dateKey(selectedDate), turno.id, name, phone);
    loadQueue();
  }

  // ---------- Pago en línea con Stripe Elements ----------
  async function prepararStripe() {
    if (stripeListo) {
      const btn = document.getElementById('pagoLineaConfirm');
      btn.disabled = false;
      btn.textContent = 'Pagar y confirmar';
      return stripeCardElement;
    }
    if (stripePreparacion) return stripePreparacion;

    stripePreparacion = (async () => {
      const errBox = document.getElementById('stripeCardErrors');
      const btn = document.getElementById('pagoLineaConfirm');
      try {
        if (typeof Stripe === 'undefined') {
          throw new Error('No se pudo cargar Stripe. Revisa tu conexión y vuelve a abrir la página.');
        }
        const { publishableKey } = await api.configPagos();
        if (!publishableKey || !publishableKey.startsWith('pk_')) {
          throw new Error('Falta configurar STRIPE_PUBLISHABLE_KEY en backend/.env.');
        }
        stripeInstance = Stripe(publishableKey);
        stripeElements = stripeInstance.elements();
        stripeCardElement = stripeElements.create('card', { style: { base: { fontSize: '15px' } } });
        stripeCardElement.on('change', (event) => {
          errBox.style.display = event.error ? 'block' : 'none';
          errBox.textContent = event.error ? event.error.message : '';
        });
        // Montar después de mostrar el modal evita inicializar el iframe de
        // Stripe dentro de un contenedor oculto.
        stripeCardElement.mount('#stripeCardElement');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Stripe tardó demasiado en cargar el campo de tarjeta. Prueba de nuevo o abre el sitio en Chrome.')), 15000);
          stripeCardElement.on('ready', () => { clearTimeout(timeout); resolve(); });
        });
        stripeListo = true;
        btn.disabled = false;
        btn.textContent = 'Pagar y confirmar';
        return stripeCardElement;
      } catch (e) {
        if (stripeCardElement) stripeCardElement.unmount();
        stripeInstance = null;
        stripeElements = null;
        stripeCardElement = null;
        stripeListo = false;
        errBox.textContent = e.message || 'No se pudo cargar el campo de tarjeta.';
        errBox.style.display = 'block';
        btn.disabled = true;
        btn.textContent = 'Tarjeta no disponible';
        throw e;
      }
    })().finally(() => { stripePreparacion = null; });
    return stripePreparacion;
  }

  document.getElementById('pagoLineaCancel').addEventListener('click', () => {
    document.getElementById('pagoLineaModal').classList.remove('show');
    showToast('Tu horario queda reservado por un momento; completa el pago para confirmarlo.');
  });

  document.getElementById('pagoLineaConfirm').addEventListener('click', async () => {
    if (!stripeInstance || !stripeCardElement) {
      showToast('El campo de tarjeta todavía no está listo. Revisa el mensaje del formulario.');
      return;
    }
    const btn = document.getElementById('pagoLineaConfirm');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    try {
      const { clientSecret } = await api.crearIntentoPago(turnoPendienteDePago.id);
      btn.textContent = 'Verificando tarjeta...';
      const resultado = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: {
          card: stripeCardElement,
          billing_details: { name: turnoPendienteDePago.clienteNombre }
        }
      });

      if (resultado.error) {
        const errBox = document.getElementById('stripeCardErrors');
        errBox.style.display = 'block';
        errBox.textContent = resultado.error.message;
      } else if (resultado.paymentIntent && resultado.paymentIntent.status === 'succeeded') {
        // El estado real del turno ("confirmado") lo pone el webhook cuando
        // Stripe le avisa al backend; acá solo cerramos la pantalla del cliente.
        document.getElementById('pagoLineaModal').classList.remove('show');
        finalizarReserva(turnoPendienteDePago, turnoPendienteDePago.clienteNombre, turnoPendienteDePago.clienteTelefono);
        showToast('✓ Pago realizado. Confirmando tu turno...');
      }
    } catch (e) {
      showToast(e.message || 'No se pudo procesar el pago.');
    }
    btn.disabled = false;
    btn.textContent = 'Pagar y confirmar';
  });

  // ---------- Modo dueño: login ----------
  const pinModal = document.getElementById('pinModal');
  const pinInput = document.getElementById('pinInput');

  document.getElementById('ownerToggle').addEventListener('click', () => {
    if (ownerMode) { exitOwnerMode('Volviste a la vista de cliente.'); return; }
    pinInput.value = '';
    pinModal.classList.add('show');
    pinInput.focus();
  });
  document.getElementById('pinCancel').addEventListener('click', () => pinModal.classList.remove('show'));
  pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('pinConfirm').click(); });

  document.getElementById('pinConfirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('pinConfirm');
    confirmBtn.disabled = true;
    try {
      const data = await api.loginOwner(pinInput.value);
      guardarTokenOwner(data.token);
      pinModal.classList.remove('show');
      setOwnerMode(true);
      showToast('Modo dueño activado.');
    } catch (e) {
      showToast(e.message || 'PIN incorrecto.');
    }
    confirmBtn.disabled = false;
  });

  // ---------- Historial ----------
  const historyModal = document.getElementById('historyModal');
  function prettyDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  }

  async function loadHistory() {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = '<div class="hist-empty">Cargando…</div>';
    let dias;
    try { dias = await api.historial(); }
    catch (e) {
      if (e.noAutorizado) { exitOwnerMode(e.message); historyModal.classList.remove('show'); return; }
      listEl.innerHTML = '<div class="hist-empty">No se pudo cargar el historial.</div>';
      return;
    }
    if (dias.length === 0) { listEl.innerHTML = '<div class="hist-empty">Todavía no hay historial guardado.</div>'; return; }
    listEl.innerHTML = '';
    const hoyStr = dateKey(new Date());
    dias.forEach(d => {
      const row = document.createElement('div');
      row.className = 'hist-row';
      row.innerHTML = `<div class="hd">${prettyDate(d.fecha)}${d.fecha === hoyStr ? ' · hoy' : ''}<small>${d.cantidad} turnos registrados</small></div><button class="hist-del" data-fecha="${d.fecha}">Borrar</button>`;
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('.hist-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true; btn.textContent = 'Borrando…';
        try {
          await api.vaciarDia(btn.dataset.fecha);
          showToast('Día borrado del historial.');
          if (btn.dataset.fecha === dateKey(selectedDate)) await loadQueue();
          await loadHistory();
        } catch (e) { showToast(e.message); btn.disabled = false; btn.textContent = 'Borrar'; }
      });
    });
  }

  document.getElementById('historyBtn').addEventListener('click', () => { historyModal.classList.add('show'); loadHistory(); });
  document.getElementById('historyClose').addEventListener('click', () => historyModal.classList.remove('show'));

  document.getElementById('historyClearOld').addEventListener('click', async () => {
    const btn = document.getElementById('historyClearOld');
    if (!confirm('¿Borrar todos los turnos de hace más de 7 días? Esta acción no se puede deshacer.')) return;
    btn.disabled = true; btn.textContent = 'Limpiando…';
    try {
      const { eliminados } = await api.limpiarAntiguos();
      showToast(eliminados > 0 ? `Se borraron ${eliminados} turnos viejos.` : 'No había turnos viejos para borrar.');
      await loadHistory();
      await loadQueue();
    } catch (e) { showToast(e.message); }
    btn.disabled = false; btn.textContent = 'Limpiar ahora';
  });

  // ---------- Notificaciones push (OneSignal) ----------
  document.getElementById('notifyMeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('notifyMeBtn');
    const saved = getMyTurnForDate(dateKey(selectedDate));
    if (!saved || typeof OneSignalDeferred === 'undefined') { showToast('Los recordatorios no están disponibles en este momento.'); return; }
    btn.disabled = true; btn.textContent = 'Activando...';
    OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.Notifications.requestPermission();
        const playerId = await OneSignal.User.PushSubscription.id;
        if (!playerId) { showToast('No se pudo activar el recordatorio. ¿Permitiste las notificaciones?'); btn.disabled = false; btn.textContent = '🔔 Avisarme cuando se acerque'; return; }
        await api.guardarNotificacion(saved.id, playerId);
        markNotifyRequested(dateKey(selectedDate));
        showToast('Listo, te avisamos cuando se acerque tu turno.');
        updateMyTurnCard();
      } catch (e) {
        showToast('No se pudo activar el recordatorio.');
        btn.disabled = false; btn.textContent = '🔔 Avisarme cuando se acerque';
      }
    });
  });

  // ---------- Arranque ----------
  async function iniciar() {
    try { CATALOGO_SERVICIOS = await api.servicios(); } catch (e) { CATALOGO_SERVICIOS = []; }
    try { await cargarHorarioSemanal(); } catch (e) {}
    renderServicesSummary();
    await buildDayTabs();
    if (ownerMode) setOwnerMode(true); // token ya cargado desde sessionStorage al inicio del archivo
  }
  iniciar();

  // ---------- Refresco automático ----------
  let userInteracting = false;
  let interactionTimer = null;
  const queueItemsEl = document.getElementById('queueItems');
  ['pointerdown', 'touchstart'].forEach(evt => {
    queueItemsEl.addEventListener(evt, () => {
      userInteracting = true;
      clearTimeout(interactionTimer);
      interactionTimer = setTimeout(() => { userInteracting = false; }, 1500);
    }, { passive: true });
  });

  setInterval(() => { if (!document.hidden && !userInteracting && togglesInFlight.size === 0 && selectedDate) loadQueue(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !userInteracting && togglesInFlight.size === 0 && selectedDate) loadQueue(); });
  window.addEventListener('focus', () => { if (!document.hidden && !userInteracting && togglesInFlight.size === 0 && selectedDate) loadQueue(); });
})();
