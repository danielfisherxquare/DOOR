import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'door-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d'; // 默认 7 天

/**
 * 生成 JWT Token
 */
export function generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * 验证 JWT Token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * 认证中间件
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未授权，请先登录'
    });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Token 无效或已过期，请重新登录'
    });
  }
  
  req.user = decoded;
  next();
}

/**
 * 可选认证中间件（不强制要求登录）
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

export default { generateToken, verifyToken, authMiddleware, optionalAuthMiddleware };