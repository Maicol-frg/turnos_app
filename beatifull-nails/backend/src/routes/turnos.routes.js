const { Router } = require('express');
const ctrl = require('../controllers/turnos.controller');
const verificarOwner = require('../middleware/verificarOwner');
const detectarOwner = require('../middleware/detectarOwner');

const router = Router();

// Público (cualquier cliente puede reservar y consultar el listado del día).
router.post('/', ctrl.crear);
router.get('/reportes/historial', verificarOwner, ctrl.historial); // antes de '/:fecha' para que no choquen las rutas
router.post('/reportes/limpiar', verificarOwner, ctrl.limpiar);
router.get('/uno/:id', ctrl.obtenerUno);
router.get('/:fecha', detectarOwner, ctrl.listarPorFecha);
router.post('/:id/notificaciones', ctrl.guardarNotificacion);

// Solo dueña.
router.patch('/:id/hora', verificarOwner, ctrl.cambiarHora);
router.patch('/:id/atendido', verificarOwner, ctrl.alternarAtendido);
router.patch('/:id/aprobar', verificarOwner, ctrl.aprobar);
router.patch('/:id/rechazar', verificarOwner, ctrl.rechazar);
router.delete('/dia/:fecha', verificarOwner, ctrl.vaciarDia);
router.delete('/:id', verificarOwner, ctrl.eliminar);

module.exports = router;
