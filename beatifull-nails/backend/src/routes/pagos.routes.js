const { Router } = require('express');
const ctrl = require('../controllers/pagos.controller');

const router = Router();

router.get('/config', ctrl.config);
router.post('/crear-intento', ctrl.crearIntento);
// El webhook se monta aparte en server.js, con el body sin parsear como
// JSON (Stripe necesita el body crudo para validar la firma).

module.exports = router;
