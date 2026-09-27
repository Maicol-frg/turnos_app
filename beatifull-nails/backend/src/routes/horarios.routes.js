const { Router } = require('express');
const ctrl = require('../controllers/horarios.controller');
const verificarOwner = require('../middleware/verificarOwner');

const router = Router();

// Lectura: la usa cualquier cliente para ver días y disponibilidad.
router.get('/dias', ctrl.listarProximosDias);
router.get('/semanal', ctrl.obtenerHorarioSemanal);
router.get('/:fecha', ctrl.obtenerDia);

// Edición: solo la dueña.
router.put('/semanal', verificarOwner, ctrl.actualizarHorarioSemanal);
router.put('/:fecha/cierre', verificarOwner, ctrl.actualizarCierre);
router.delete('/:fecha/cierre', verificarOwner, ctrl.borrarCierre);
router.put('/:fecha/configuracion', verificarOwner, ctrl.actualizarConfiguracionDia);
router.delete('/:fecha/horarios-exactos', verificarOwner, ctrl.quitarHorarioPropio);

module.exports = router;
