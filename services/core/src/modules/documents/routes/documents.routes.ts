import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../auth';
import {
  deleteDocumentHandler,
  downloadDocumentHandler,
  getDocument,
  getDocuments,
  updateDocumentHandler,
  uploadDocumentHandler,
} from '../controllers/documents.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.NAS_MAX_UPLOAD_BYTES || 50 * 1024 * 1024),
  },
});

export const createDocumentsRoutes = (): Router => {
  const router = Router();

  router.get('/', authMiddleware, getDocuments);
  router.get('/:id', authMiddleware, getDocument);
  router.get('/:id/download', authMiddleware, downloadDocumentHandler);
  router.post('/upload', authMiddleware, upload.single('file'), uploadDocumentHandler);
  router.put('/:id', authMiddleware, updateDocumentHandler);
  router.patch('/:id', authMiddleware, updateDocumentHandler);
  router.delete('/:id', authMiddleware, deleteDocumentHandler);

  return router;
};
