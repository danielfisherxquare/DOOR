/**
 * Profile Routes — 个人页面 API
 */
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import knex from '../../db/knex.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { buildAuthzProfileFromRows, loadAuthzRows } from '../../authz/profile.service.js';
import { getUserAllModules } from '../../authz/module-grants.js';
import { listEffectiveRacePermissionsForUser, listVisibleRacesForOrg } from '../races/race-access.service.js';

const router = Router();

// 文件上传配置
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const avatarDir = path.join(uploadDir, 'avatars');
const credentialDir = path.join(uploadDir, 'credentials');

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return normalizeId(value[0]);
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeRaceId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}

function resolveSourceType(source) {
  if (source === 'user_assignment') return 'explicit';
  if (source === 'super_admin') return 'platform';
  return 'inherited';
}

function pickFirstValid(candidates, validSet) {
  for (const candidate of candidates) {
    const normalized = normalizeId(candidate);
    if (!normalized) continue;
    if (validSet.has(normalized)) return normalized;
  }
  return null;
}

async function canBuildRaceAuthzProfile({ account, race, rows }) {
  try {
    await buildAuthzProfileFromRows({
      authContext: {
        userId: account.id,
        role: account.role,
        orgId: account.org_id || null,
      },
      requestedOrgId: race.orgId,
      requestedRaceId: race.id,
      rows,
    });
    return true;
  } catch (error) {
    if (error?.status === 403) return false;
    throw error;
  }
}

async function filterRaceOptionsByAuthzProfile({ account, races, rows }) {
  const result = [];
  for (const race of races) {
    if (await canBuildRaceAuthzProfile({ account, race, rows })) {
      result.push(race);
    }
  }
  return result;
}

// 确保上传目录存在
async function ensureUploadDirs() {
  await fs.mkdir(avatarDir, { recursive: true });
  await fs.mkdir(credentialDir, { recursive: true });
}
ensureUploadDirs();

// Multer 配置
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('只允许上传图片文件'));
    }
    cb(null, true);
  },
});

/**
 * GET /api/profile/me — 获取当前用户完整信息
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authContext.userId;

    const user = await knex('users')
      .select(
        'id', 'username', 'email', 'role', 'status',
        'org_id', 'job_title', 'department',
        'avatar_url', 'avatar_for_credential',
        'phone', 'bio', 'skills', 'user_preferences',
        'email_verified', 'must_change_password', 'created_at'
      )
      .where('id', userId)
      .first();

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 获取组织信息
    let organization = null;
    if (user.org_id) {
      organization = await knex('organizations')
        .select('id', 'name', 'slug')
        .where('id', user.org_id)
        .first();
    }

    // 获取模块访问权限
    const moduleAccess = await getUserAllModules(userId, user.role);

    // 获取用户参与的赛事（工作概览）
    const races = await knex('user_race_permissions')
      .join('races', 'user_race_permissions.race_id', 'races.id')
      .select('races.id', 'races.name', 'user_race_permissions.access_level')
      .where('user_race_permissions.user_id', userId);

    res.json({
      success: true,
      data: {
        ...user,
        organization,
        moduleAccess,
        races,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/context-options — 获取三层统一上下文可选项
 */
router.get('/context-options', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authContext.userId;
    const account = await knex('users')
      .select('id', 'role', 'org_id', 'preferences')
      .where('id', userId)
      .first();

    if (!account) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const requestedOrgId = normalizeId(req.query.orgId);
    const requestedRaceId = normalizeRaceId(req.query.raceId);
    const preferredOrgId = normalizeId(account.preferences?.lastOrgId);
    const preferredRaceId = normalizeRaceId(account.preferences?.lastRaceId);
    const authzRows = await loadAuthzRows();

    let organizations = [];
    let races = [];
    let selectedOrgId = null;
    let canSwitchOrg = false;
    let canSwitchRace = false;

    if (account.role === 'super_admin') {
      canSwitchOrg = true;
      const orgRows = await knex('organizations')
        .select('id', 'name', 'slug')
        .orderBy('name', 'asc');
      organizations = orgRows.map((row) => ({
        id: String(row.id),
        name: row.name,
        slug: row.slug,
      }));

      const orgIdSet = new Set(organizations.map((org) => org.id));
      selectedOrgId = pickFirstValid([requestedOrgId, preferredOrgId], orgIdSet);

      if (selectedOrgId) {
        const visibleRaces = await listVisibleRacesForOrg(selectedOrgId);
        races = visibleRaces.map((race) => ({
          id: String(race.id),
          raceId: String(race.id),
          name: race.name,
          raceName: race.name,
          orgId: String(race.orgId),
          accessLevel: 'editor',
          source: 'super_admin',
          sourceType: 'platform',
          inheritedAccessLevel: 'editor',
          explicitAccessLevel: null,
        }));
        races = await filterRaceOptionsByAuthzProfile({ account, races, rows: authzRows });
        canSwitchRace = races.length > 0;
      }
    } else {
      selectedOrgId = normalizeId(account.org_id);
      if (selectedOrgId) {
        const org = await knex('organizations')
          .select('id', 'name', 'slug')
          .where('id', selectedOrgId)
          .first();
        if (org) {
          organizations = [{
            id: String(org.id),
            name: org.name,
            slug: org.slug,
          }];
        }
      }

      if (account.role === 'org_admin') {
        const visibleRaces = await listVisibleRacesForOrg(selectedOrgId);
        races = visibleRaces.map((race) => ({
          id: String(race.id),
          raceId: String(race.id),
          name: race.name,
          raceName: race.name,
          orgId: String(race.orgId),
          accessLevel: race.orgAccessLevel || 'viewer',
          source: race.source,
          sourceType: 'inherited',
          inheritedAccessLevel: race.orgAccessLevel || 'viewer',
          explicitAccessLevel: null,
        }));
        races = await filterRaceOptionsByAuthzProfile({ account, races, rows: authzRows });
      } else {
        const effectiveRaces = await listEffectiveRacePermissionsForUser({
          userId: account.id,
          role: account.role,
          orgId: account.org_id || null,
        });
        const raceIds = effectiveRaces.map((item) => Number(item.raceId)).filter((id) => Number.isFinite(id));
        const raceRows = raceIds.length > 0
          ? await knex('races').whereIn('id', raceIds).select('id', 'name', 'org_id')
          : [];
        const raceMap = new Map(raceRows.map((row) => [Number(row.id), row]));

        races = effectiveRaces.map((permission) => {
          const race = raceMap.get(Number(permission.raceId));
          return {
            id: String(permission.raceId),
            raceId: String(permission.raceId),
            name: race?.name || null,
            raceName: race?.name || null,
            orgId: race?.org_id ? String(race.org_id) : selectedOrgId,
            accessLevel: permission.accessLevel,
            source: permission.source,
            sourceType: resolveSourceType(permission.source),
            inheritedAccessLevel: permission.inheritedAccessLevel || null,
            explicitAccessLevel: permission.explicitAccessLevel || null,
          };
        });
        races = await filterRaceOptionsByAuthzProfile({ account, races, rows: authzRows });
      }

      canSwitchRace = races.length > 0;
    }

    const raceIdSet = new Set(races.map((race) => String(race.id)));
    const selectedRaceId = pickFirstValid([requestedRaceId, preferredRaceId], raceIdSet);

    res.json({
      success: true,
      data: {
        role: account.role,
        canSwitchOrg,
        canSwitchRace,
        locks: {
          orgId: canSwitchOrg ? null : selectedOrgId,
          raceId: null,
        },
        current: {
          orgId: selectedOrgId,
          raceId: selectedRaceId,
          scopeType: account.role === 'super_admin' && !selectedOrgId
            ? 'platform'
            : (selectedRaceId ? 'race' : 'org'),
        },
        organizations,
        races,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/profile/me — 更新个人信息
 */
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.authContext.userId;
    const { phone, bio, skills, preferences } = req.body;

    const updates = {};
    if (phone !== undefined) updates.phone = phone;
    if (bio !== undefined) updates.bio = bio;
    if (skills !== undefined) updates.skills = skills;
    if (preferences !== undefined) updates.user_preferences = preferences;
    updates.updated_at = knex.fn.now();

    await knex('users').where('id', userId).update(updates);

    res.json({ success: true, message: '个人信息已更新' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile/avatar — 上传头像
 */
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未提供图片文件' });
    }

    const userId = req.authContext.userId;
    const filename = `${userId}-${Date.now()}.webp`;
    const filepath = path.join(avatarDir, filename);

    // 压缩并保存图片
    await sharp(req.file.buffer)
      .resize(200, 200, { fit: 'cover' })
      .webp({ quality: 85 })
      .toFile(filepath);

    // 更新数据库
    const avatarUrl = `/uploads/avatars/${filename}`;
    await knex('users')
      .where('id', userId)
      .update({ avatar_url: avatarUrl, updated_at: knex.fn.now() });

    res.json({
      success: true,
      data: { avatarUrl },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile/credential-photo — 上传证件照片
 */
router.post('/credential-photo', requireAuth, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '未提供图片文件' });
    }

    const userId = req.authContext.userId;
    const filename = `${userId}-credential-${Date.now()}.webp`;
    const filepath = path.join(credentialDir, filename);

    // 压缩并保存图片（保持比例，用于证件）
    await sharp(req.file.buffer)
      .resize(400, 560, { fit: 'cover' }) // 证件照常见比例
      .webp({ quality: 90 })
      .toFile(filepath);

    // 更新数据库
    const photoUrl = `/uploads/credentials/${filename}`;
    await knex('users')
      .where('id', userId)
      .update({ avatar_for_credential: photoUrl, updated_at: knex.fn.now() });

    res.json({
      success: true,
      data: { photoUrl },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/profile/:userId — 查看他人信息（受限）
 */
router.get('/:userId', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requesterOrgId = req.authContext.orgId;
    const requesterRole = req.authContext.role;

    const user = await knex('users')
      .select(
        'id', 'username', 'role', 'job_title', 'department',
        'avatar_url', 'phone', 'bio', 'skills', 'org_id'
      )
      .where('id', userId)
      .first();

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 只允许查看同组织用户（super_admin 除外）
    if (requesterRole !== 'super_admin' && user.org_id !== requesterOrgId) {
      return res.status(403).json({ success: false, message: '无权查看该用户信息' });
    }

    // 获取组织信息
    let organization = null;
    if (user.org_id) {
      organization = await knex('organizations')
        .select('id', 'name', 'slug')
        .where('id', user.org_id)
        .first();
    }

    res.json({
      success: true,
      data: {
        ...user,
        organization,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
