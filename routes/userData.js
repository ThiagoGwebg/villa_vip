const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const { getUserData, saveUserData } = require('../controllers/userDataController');

router.get('/', authMiddleware, getUserData);
router.put('/', authMiddleware, saveUserData);

module.exports = router;
