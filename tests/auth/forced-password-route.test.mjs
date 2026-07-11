import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../../', import.meta.url)

async function source(relativePath) {
  return readFile(new URL(relativePath, rootUrl), 'utf8')
}

test('forced password changes use one authenticated route outside workspace layouts', async () => {
  const [app, login, authStore, surfaceGuard, changePassword] = await Promise.all([
    source('src/App.jsx'),
    source('src/views/Login.jsx'),
    source('src/stores/authStore.js'),
    source('src/components/SurfaceProtectedRoute.jsx'),
    source('src/views/ChangePassword.jsx'),
  ])

  assert.match(app, /path="\/change-password"/)
  assert.match(app, /<AuthRoute>/)
  assert.match(login, /navigate\('\/change-password'/)
  assert.match(authStore, /return '\/change-password'/)
  assert.match(authStore, /if \(user\.mustChangePassword\)[\s\S]{0,320}isAuthenticated: true/)
  assert.match(authStore, /if \(response\.data\?\.mustChangePassword\)[\s\S]{0,320}isAuthenticated: true/)
  assert.match(surfaceGuard, /<Navigate to="\/change-password"/)

  assert.doesNotMatch(login, /navigate\('\/app\/settings'/)
  assert.doesNotMatch(surfaceGuard, /mustChangePassword[\s\S]{0,160}\/app\/settings/)
  assert.equal((changePassword.match(/autoComplete="current-password"/g) || []).length, 1)
  assert.equal((changePassword.match(/autoComplete="new-password"/g) || []).length, 2)
  assert.match(changePassword, /name="username"[\s\S]{0,160}autoComplete="username"/)
})
