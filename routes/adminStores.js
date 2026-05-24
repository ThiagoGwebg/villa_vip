const express = require('express');
const multer = require('multer');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { writeLimiter, uploadLimiter } = require('../middlewares/rateLimits');
const auditAction = require('../middlewares/auditMiddleware');
const stores = require('../services/storesService');
const { uploadStoreImage } = require('../services/storageService');

const imgUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

// Leitura é pública (a vitrine usa para mostrar endereço/horário).
router.get('/', async (_req, res) => {
  try {
    const lojas = await stores.listAll({ onlyActive: true });
    res.json({ total: lojas.length, lojas });
  } catch (err) {
    console.error('[admin/stores] list:', err);
    res.status(500).json({ message: 'Erro ao listar lojas' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const loja = await stores.getById(req.params.id);
    if (!loja) return res.status(404).json({ message: 'Loja não encontrada' });
    res.json(loja);
  } catch (err) {
    console.error('[admin/stores] get:', err);
    res.status(500).json({ message: 'Erro ao buscar loja' });
  }
});

// Edição é restrita a admin.
router.patch(
  '/:id',
  authMiddleware,
  adminMiddleware,
  writeLimiter,
  auditAction('store.update', 'store'),
  async (req, res) => {
    try {
      const loja = await stores.update(req.params.id, req.body || {});
      if (!loja) return res.status(404).json({ message: 'Loja não encontrada' });
      res.json(loja);
    } catch (err) {
      console.error('[admin/stores] update:', err);
      res.status(500).json({ message: 'Erro ao atualizar loja' });
    }
  }
);

router.post(
  '/upload',
  authMiddleware,
  adminMiddleware,
  uploadLimiter,
  imgUpload.single('imagem'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo inválido ou maior que 8 MB.' });
    }
    try {
      const url = await uploadStoreImage(req.file);
      res.json({ url });
    } catch (err) {
      console.error('[admin/stores] upload:', err);
      res.status(500).json({ message: 'Falha ao enviar imagem.' });
    }
  }
);

module.exports = router;
