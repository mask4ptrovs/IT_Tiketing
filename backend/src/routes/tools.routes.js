const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth.middleware');
const {
  pingHost, portScan, dnsLookup, subnetCalc, httpCheck, serverInfo,
} = require('../controllers/tools.controller');

// All IT tools require login AND IT_STAFF or ADMIN role
router.use(authenticate);
router.use(authorize('IT_STAFF', 'ADMIN'));

router.post('/ping',        pingHost);
router.post('/port-scan',   portScan);
router.post('/dns-lookup',  dnsLookup);
router.post('/subnet-calc', subnetCalc);
router.post('/http-check',  httpCheck);
router.get('/server-info',  serverInfo);

module.exports = router;
