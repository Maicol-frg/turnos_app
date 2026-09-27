const { Router } = require('express');
const ctrl = require('../controllers/owner.controller');
const verificarOwner = require('../middleware/verificarOwner');

const router = Router();

router.post('/login', ctrl.login);
router.get('/verificar', verificarOwner, ctrl.verificar);

module.exports = router;
