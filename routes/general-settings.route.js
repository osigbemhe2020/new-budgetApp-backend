// routes/generalSettings.route.js
const express = require('express');
const router = express.Router();
const generalSettingsController = require('../controllers/general-settings.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.use(authMiddleware);

router.get('/', generalSettingsController.getSettings);
router.put('/', generalSettingsController.updateSettings);
router.put('/cycle', generalSettingsController.updateCycleStartDay);
router.put('/release-buffer', generalSettingsController.updateReleaseBuffer);

module.exports = router;