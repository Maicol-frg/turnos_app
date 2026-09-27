const { Router } = require('express');
const { SERVICIOS } = require('../config/servicios');

const router = Router();

router.get('/', (req, res) => res.json(SERVICIOS));

module.exports = router;
