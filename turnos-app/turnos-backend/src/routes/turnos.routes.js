const { Router } = require('express');
const ctrl = require('../controllers/turnos.controller');

const router = Router();

router.post('/', ctrl.crear);
router.get('/', ctrl.listar);
router.patch('/:id', ctrl.actualizarEstado);

module.exports = router;
