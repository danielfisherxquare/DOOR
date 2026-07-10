import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../../middleware/require-auth.js'
import { profileController } from './profile.controller.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      const error = new Error('只允许上传图片文件')
      error.status = 400
      error.code = 'PROFILE_IMAGE_TYPE_INVALID'
      error.expose = true
      callback(error)
      return
    }
    callback(null, true)
  },
})

router.use(requireAuth)
router.get('/me', profileController.getMe)
router.get('/context-options', profileController.getContextOptions)
router.patch('/me', profileController.updateMe)
router.post('/avatar', upload.single('avatar'), profileController.uploadAvatar)
router.post(
  '/credential-photo',
  upload.single('photo'),
  profileController.uploadCredentialPhoto,
)
router.get('/:userId', profileController.getUser)

export default router
