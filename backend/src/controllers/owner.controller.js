const jwt = require('jsonwebtoken');

const DURACION_SESION = '2h'; // igual que las 2 horas que ya usaba Code.gs

// POST /api/owner/login   body: { pin }
function login(req, res) {
  const { pin } = req.body;

  if (!pin || String(pin) !== String(process.env.OWNER_PIN)) {
    return res.status(401).json({ error: 'pin_invalido', message: 'PIN incorrecto.' });
  }

  const token = jwt.sign({ rol: 'dueña' }, process.env.JWT_SECRET, { expiresIn: DURACION_SESION });
  res.json({ ok: true, token });
}

// GET /api/owner/verificar
// El frontend la llama al cargar la página para saber si el token guardado
// en sessionStorage todavía sirve, sin tener que pedir el PIN de nuevo.
function verificar(req, res) {
  res.json({ ok: true }); // si llegó hasta acá, ya pasó el middleware verificarOwner
}

module.exports = { login, verificar };
