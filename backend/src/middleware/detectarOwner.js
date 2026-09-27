const jwt = require('jsonwebtoken');

// A diferencia de verificarOwner (que exige sesión válida o corta la
// petición), este middleware se usa en rutas públicas que muestran más
// datos cuando quien pregunta es la dueña (ej: teléfono y servicios en el
// listado de turnos) pero igual deben responder algo a cualquier visitante.
function detectarOwner(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

  req.esDueña = false;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      req.esDueña = true;
    } catch (err) {
      // Token vencido o inválido: seguimos como visitante normal, sin cortar.
    }
  }
  next();
}

module.exports = detectarOwner;
