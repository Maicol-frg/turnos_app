const jwt = require('jsonwebtoken');

// Se usa en cualquier ruta que solo la dueña puede tocar (editar horarios,
// aprobar/rechazar turnos en efectivo, etc.). Reemplaza al isOwnerToken()
// manual de Code.gs por un JWT estándar, firmado con JWT_SECRET.
function verificarOwner(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'no_autorizado', message: 'Falta iniciar sesión como dueña.' });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'no_autorizado', message: 'Tu sesión expiró. Ingresa el PIN de nuevo.' });
  }
}

module.exports = verificarOwner;
