import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../database.js';
import { generateToken, verifyToken, authMiddleware } from '../middleware/auth.js';

const router = Router();

/**
 * 用户注册
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        message: '用户名长度应在 3-20 个字符之间'
      });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的邮箱地址'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少为 6 个字符'
      });
    }
    
    const db = getDatabase();
    
    // 检查用户名是否已存在
    const existingUser = db.exec(
      `SELECT id FROM users WHERE username = ? OR email = ?`,
      [username, email]
    );
    
    if (existingUser[0]?.values?.length > 0) {
      return res.status(400).json({
        success: false,
        message: '用户名或邮箱已被注册'
      });
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const userId = uuidv4();
    const verificationToken = uuidv4(); // 邮箱验证 token
    
    db.run(
      `INSERT INTO users (id, username, email, password, verification_token, email_verified) VALUES (?, ?, ?, ?, ?, 0)`,
      [userId, username, email, hashedPassword, verificationToken]
    );
    
    saveDatabase();
    
    // 生成 token
    const token = generateToken({ id: userId, username, email });
    
    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: userId,
          username,
          email,
          avatar: null,
          emailVerified: false
        },
        token,
        verificationToken // 仅用于演示，实际项目中不会返回
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
});

/**
 * 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '请输入用户名和密码'
      });
    }
    
    const db = getDatabase();
    
    // 查找用户（支持用户名或邮箱登录）
    const result = db.exec(
      `SELECT * FROM users WHERE username = ? OR email = ?`,
      [username, username]
    );
    
    if (!result[0]?.values?.length) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const user = {};
    columns.forEach((col, i) => {
      user[col] = values[i];
    });
    
    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }
    
    // 生成 token（记住我：30天，否则7天）
    const expiresIn = rememberMe ? '30d' : '7d';
    const token = generateToken({ id: user.id, username: user.username, email: user.email }, expiresIn);
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          emailVerified: !!user.email_verified
        },
        token,
        rememberMe
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误，请稍后重试'
    });
  }
});

/**
 * 获取当前用户信息
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const result = db.exec(
      `SELECT id, username, email, avatar, email_verified, created_at FROM users WHERE id = ?`,
      [req.user.id]
    );
    
    if (!result[0]?.values?.length) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    const user = {};
    columns.forEach((col, i) => {
      user[col] = values[i];
    });
    
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        emailVerified: !!user.email_verified,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 邮箱验证（展示用）
 */
router.get('/verify-email/:token', (req, res) => {
  try {
    const { token } = req.params;
    const db = getDatabase();
    
    const result = db.exec(
      `SELECT id FROM users WHERE verification_token = ?`,
      [token]
    );
    
    if (!result[0]?.values?.length) {
      return res.status(400).json({
        success: false,
        message: '验证链接无效或已过期'
      });
    }
    
    const userId = result[0].values[0][0];
    
    db.run(
      `UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?`,
      [userId]
    );
    
    saveDatabase();
    
    res.json({
      success: true,
      message: '邮箱验证成功'
    });
  } catch (error) {
    console.error('邮箱验证错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 重新发送验证邮件（展示用）
 */
router.post('/resend-verification', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const newToken = uuidv4();
    
    db.run(
      `UPDATE users SET verification_token = ? WHERE id = ? AND email_verified = 0`,
      [newToken, req.user.id]
    );
    
    saveDatabase();
    
    res.json({
      success: true,
      message: '验证邮件已发送',
      verificationToken: newToken // 仅用于演示
    });
  } catch (error) {
    console.error('重发验证邮件错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 忘记密码（展示用）
 */
router.post('/forgot-password', (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: '请输入邮箱地址'
      });
    }
    
    const db = getDatabase();
    const result = db.exec(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );
    
    if (!result[0]?.values?.length) {
      // 为了安全，不透露用户是否存在
      return res.json({
        success: true,
        message: '如果该邮箱已注册，您将收到密码重置邮件'
      });
    }
    
    const userId = result[0].values[0][0];
    const resetToken = uuidv4();
    const resetTokenExpires = Math.floor(Date.now() / 1000) + 3600; // 1小时后过期
    
    db.run(
      `UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?`,
      [resetToken, resetTokenExpires, userId]
    );
    
    saveDatabase();
    
    res.json({
      success: true,
      message: '如果该邮箱已注册，您将收到密码重置邮件',
      resetToken // 仅用于演示
    });
  } catch (error) {
    console.error('忘记密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 重置密码（展示用）
 */
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少为 6 个字符'
      });
    }
    
    const db = getDatabase();
    const result = db.exec(
      `SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?`,
      [token, Math.floor(Date.now() / 1000)]
    );
    
    if (!result[0]?.values?.length) {
      return res.status(400).json({
        success: false,
        message: '重置链接无效或已过期'
      });
    }
    
    const userId = result[0].values[0][0];
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      `UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?`,
      [hashedPassword, userId]
    );
    
    saveDatabase();
    
    res.json({
      success: true,
      message: '密码重置成功，请使用新密码登录'
    });
  } catch (error) {
    console.error('重置密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 修改密码
 */
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: '请填写所有必填字段'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: '新密码长度至少为 6 个字符'
      });
    }
    
    const db = getDatabase();
    const result = db.exec(
      `SELECT password FROM users WHERE id = ?`,
      [req.user.id]
    );
    
    if (!result[0]?.values?.length) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }
    
    const currentPassword = result[0].values[0][0];
    const isValidPassword = await bcrypt.compare(oldPassword, currentPassword);
    
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: '原密码错误'
      });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    db.run(
      `UPDATE users SET password = ?, updated_at = strftime('%s', 'now') WHERE id = ?`,
      [hashedPassword, req.user.id]
    );
    
    saveDatabase();
    
    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({
      success: false,
      message: '服务器错误'
    });
  }
});

/**
 * 用户登出
 */
router.post('/logout', (req, res) => {
  // JWT 是无状态的，服务端不需要做特殊处理
  // 客户端删除 token 即可
  res.json({
    success: true,
    message: '登出成功'
  });
});

export default router;