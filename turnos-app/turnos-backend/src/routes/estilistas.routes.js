const { Router } = require('express');
const ctrl = require('../controllers/estilistas.controller');

const router = Router();

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtenerUno);
router.get('/:id/disponibilidad', ctrl.disponibilidad);

module.exports = router;
