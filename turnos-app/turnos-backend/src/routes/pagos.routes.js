const { Router } = require('express');
const ctrl = require('../controllers/pagos.controller');

const router = Router();

router.post('/crear-intento', ctrl.crearIntento);
router.post('/webhook', ctrl.webhook);

module.exports = router;
