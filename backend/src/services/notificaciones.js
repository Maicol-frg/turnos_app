/*
 * Envío de recordatorios push ("ya casi es tu turno") vía OneSignal.
 *
 * Requiere ONESIGNAL_APP_ID y ONESIGNAL_REST_API_KEY en el .env (la REST
 * API Key se saca del panel de OneSignal, en Settings → Keys & IDs — nunca
 * es la misma que el App ID que usa el frontend).
 */

async function enviarPush(playerId, mensaje) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey || !playerId) return { ok: false, motivo: 'faltan_credenciales_o_playerId' };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`
      },
      body: JSON.stringify({
        app_id: appId,
        include_subscription_ids: [playerId],
        headings: { en: 'Beatifull Nails', es: 'Beatifull Nails' },
        contents: { en: mensaje, es: mensaje }
      })
    });
    if (!res.ok) return { ok: false, motivo: 'onesignal_error_' + res.status };
    return { ok: true };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

module.exports = { enviarPush };
