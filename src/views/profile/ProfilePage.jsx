import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import profileApi from '../../api/profile';
import useAuthStore from '../../stores/authStore';

/**
 * 个人页面组件
 */
export default function ProfilePage() {
  const { fetchCurrentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [activeTab, setActiveTab] = useState('info');

  const avatarInputRef = useRef(null);
  const credentialInputRef = useRef(null);

  // 加载个人资料
  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const res = await profileApi.getMe();
      if (res.success) {
        setProfile(res.data);
        setFormData({
          phone: res.data.phone || '',
          bio: res.data.bio || '',
          skills: res.data.skills || [],
        });
      }
    } catch (err) {
      console.error('加载个人资料失败:', err);
    } finally {
      setLoading(false);
    }
  }

  // 保存个人信息
  async function handleSave() {
    try {
      setSaving(true);
      const res = await profileApi.updateMe(formData);
      if (res.success) {
        setEditMode(false);
        await fetchCurrentUser();
        await loadProfile();
      }
    } catch (err) {
      alert(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // 上传头像
  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await profileApi.uploadAvatar(file);
      if (res.success) {
        await fetchCurrentUser();
        await loadProfile();
      }
    } catch (err) {
      alert(`上传失败: ${err.message}`);
    }
  }

  // 上传证件照片
  async function handleCredentialPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await profileApi.uploadCredentialPhoto(file);
      if (res.success) {
        await loadProfile();
      }
    } catch (err) {
      alert(`上传失败: ${err.message}`);
    }
  }

  // 角色显示名称
  const roleNames = {
    super_admin: '超级管理员',
    org_admin: '机构管理员',
    race_admin: '赛事管理员',
    user: '普通用户',
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-page__loading">加载中...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page">
        <div className="profile-page__error">加载失败</div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      {/* 头部区域 */}
      <div className="profile-header">
        <div className="profile-header__avatar-section">
          <div
            className="profile-header__avatar"
            onClick={() => avatarInputRef.current?.click()}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="头像" />
            ) : (
              <span className="profile-header__avatar-placeholder">
                {profile.username?.slice(0, 2)?.toUpperCase()}
              </span>
            )}
            <div className="profile-header__avatar-overlay">
              <span className="material-symbols-outlined">camera_alt</span>
            </div>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />

          <div className="profile-header__info">
            <h1>{profile.username}</h1>
            <div className="profile-header__meta">
              <span className="profile-header__role">
                {roleNames[profile.role] || profile.role}
              </span>
              {profile.job_title && (
                <span className="profile-header__job-title">{profile.job_title}</span>
              )}
            </div>
            {profile.organization && (
              <p className="profile-header__org">{profile.organization.name}</p>
            )}
          </div>
        </div>

        {/* 证件照片区域 */}
        <div className="profile-header__credential">
          <h3>证件照片</h3>
          <div
            className="profile-header__credential-photo"
            onClick={() => credentialInputRef.current?.click()}
          >
            {profile.avatar_for_credential ? (
              <img src={profile.avatar_for_credential} alt="证件照" />
            ) : (
              <div className="profile-header__credential-placeholder">
                <span className="material-symbols-outlined">badge</span>
                <span>上传证件照</span>
              </div>
            )}
          </div>
          <input
            ref={credentialInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleCredentialPhotoChange}
          />
          <p className="profile-header__credential-hint">
            用于凭证证件制作，建议上传正式证件照
          </p>
        </div>
      </div>

      {/* 标签页 */}
      <div className="profile-tabs">
        <button
          className={`profile-tabs__tab ${activeTab === 'info' ? 'profile-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          基本信息
        </button>
        <button
          className={`profile-tabs__tab ${activeTab === 'work' ? 'profile-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('work')}
        >
          工作概览
        </button>
        <button
          className={`profile-tabs__tab ${activeTab === 'settings' ? 'profile-tabs__tab--active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          个人设置
        </button>
      </div>

      {/* 内容区域 */}
      <div className="profile-content">
        {/* 基本信息 */}
        {activeTab === 'info' && (
          <div className="profile-section">
            <div className="profile-section__header">
              <h2>基本信息</h2>
              {!editMode && (
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => setEditMode(true)}
                >
                  编辑
                </button>
              )}
            </div>

            <div className="profile-section__body">
              <div className="profile-field">
                <label>用户名</label>
                <span>{profile.username}</span>
              </div>
              <div className="profile-field">
                <label>邮箱</label>
                <span>{profile.email}</span>
              </div>
              <div className="profile-field">
                <label>职级</label>
                <span>{profile.job_title || '未设置'}</span>
              </div>
              <div className="profile-field">
                <label>部门</label>
                <span>{profile.department || '未设置'}</span>
              </div>

              {editMode ? (
                <>
                  <div className="profile-field">
                    <label>联系电话</label>
                    <input
                      type="tel"
                      className="input"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="请输入联系电话"
                    />
                  </div>
                  <div className="profile-field profile-field--full">
                    <label>个人简介</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="介绍一下自己..."
                    />
                  </div>

                  <div className="profile-section__actions">
                    <button
                      className="btn btn--secondary"
                      onClick={() => setEditMode(false)}
                    >
                      取消
                    </button>
                    <button
                      className="btn btn--primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-field">
                    <label>联系电话</label>
                    <span>{profile.phone || '未填写'}</span>
                  </div>
                  <div className="profile-field profile-field--full">
                    <label>个人简介</label>
                    <span>{profile.bio || '未填写'}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 工作概览 */}
        {activeTab === 'work' && (
          <div className="profile-section">
            <div className="profile-section__header">
              <h2>参与的赛事</h2>
            </div>
            <div className="profile-section__body">
              {profile.races && profile.races.length > 0 ? (
                <div className="profile-races">
                  {profile.races.map((race) => (
                    <div key={race.id} className="profile-race-item">
                      <span className="profile-race-item__name">{race.name}</span>
                      <span className="profile-race-item__role">
                        {race.access_level === 'editor' ? '编辑' : '查看'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="profile-section__empty">暂无参与赛事</p>
              )}
            </div>
          </div>
        )}

        {/* 个人设置 */}
        {activeTab === 'settings' && (
          <div className="profile-section">
            <div className="profile-section__header">
              <h2>账户安全</h2>
            </div>
            <div className="profile-section__body">
              <div className="profile-setting-item">
                <div className="profile-setting-item__info">
                  <h3>密码</h3>
                  <p>定期修改密码可以保护账户安全</p>
                </div>
                <Link to="/app/settings" className="btn btn--secondary btn--sm">
                  修改密码
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .profile-page {
          padding: 24px;
          max-width: 900px;
          margin: 0 auto;
        }

        .profile-page__loading,
        .profile-page__error {
          padding: 60px;
          text-align: center;
          color: var(--text-secondary);
        }

        .profile-header {
          display: flex;
          gap: 32px;
          padding: 32px;
          background: var(--surface);
          border-radius: var(--radius-lg);
          margin-bottom: 24px;
          border: 1px solid var(--border);
        }

        .profile-header__avatar-section {
          display: flex;
          gap: 20px;
          flex: 1;
        }

        .profile-header__avatar {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          overflow: hidden;
          cursor: pointer;
          position: relative;
          background: var(--bg-secondary);
        }

        .profile-header__avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profile-header__avatar-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          font-size: 32px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .profile-header__avatar-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .profile-header__avatar:hover .profile-header__avatar-overlay {
          opacity: 1;
        }

        .profile-header__avatar-overlay .material-symbols-outlined {
          color: white;
          font-size: 28px;
        }

        .profile-header__info h1 {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
        }

        .profile-header__meta {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .profile-header__role {
          display: inline-block;
          padding: 4px 12px;
          background: var(--primary-soft);
          color: var(--primary);
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 600;
        }

        .profile-header__job-title {
          color: var(--text-secondary);
          font-size: 14px;
        }

        .profile-header__org {
          color: var(--text-secondary);
          margin: 0;
          font-size: 14px;
        }

        .profile-header__credential {
          text-align: center;
          padding-left: 32px;
          border-left: 1px solid var(--border);
        }

        .profile-header__credential h3 {
          margin: 0 0 12px;
          font-size: 14px;
          font-weight: 600;
        }

        .profile-header__credential-photo {
          width: 100px;
          height: 140px;
          border-radius: var(--radius-md);
          overflow: hidden;
          cursor: pointer;
          background: var(--bg-secondary);
          border: 1px dashed var(--border);
        }

        .profile-header__credential-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profile-header__credential-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary);
          font-size: 12px;
          gap: 8px;
        }

        .profile-header__credential-hint {
          margin: 8px 0 0;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .profile-tabs {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          margin-bottom: 24px;
        }

        .profile-tabs__tab {
          flex: 1;
          padding: 12px 16px;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .profile-tabs__tab:hover {
          background: var(--surface);
        }

        .profile-tabs__tab--active {
          background: var(--surface);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .profile-section {
          background: var(--surface);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
        }

        .profile-section__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
        }

        .profile-section__header h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .profile-section__body {
          padding: 24px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .profile-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .profile-field--full {
          grid-column: 1 / -1;
        }

        .profile-field label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .profile-field span {
          font-size: 14px;
        }

        .profile-field .input {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 14px;
        }

        .profile-section__actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
        }

        .profile-section__empty {
          grid-column: 1 / -1;
          text-align: center;
          color: var(--text-secondary);
          padding: 24px;
        }

        .profile-races {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .profile-race-item {
          display: flex;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }

        .profile-race-item__name {
          font-weight: 500;
        }

        .profile-race-item__role {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .profile-setting-item {
          grid-column: 1 / -1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
        }

        .profile-setting-item__info h3 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
        }

        .profile-setting-item__info p {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary);
        }

        @media (max-width: 640px) {
          .profile-header {
            flex-direction: column;
          }

          .profile-header__avatar-section {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .profile-header__credential {
            border-left: none;
            border-top: 1px solid var(--border);
            padding-left: 0;
            padding-top: 24px;
          }

          .profile-section__body {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
