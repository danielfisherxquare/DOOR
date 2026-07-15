import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const root = new URL('../..', import.meta.url)
const fromRoot = (...parts) => join(root.pathname, ...parts)

function read(path) {
  return readFileSync(fromRoot(path), 'utf8')
}

describe('中奥致远 H5 app shell', () => {
  it('publishes installable PWA metadata for iOS and Android', () => {
    const index = read('index.html')

    assert.match(index, /<link rel="manifest" href="\/manifest\.webmanifest"/)
    assert.match(index, /<meta name="theme-color" content="#D4A017"/)
    assert.match(index, /<meta name="mobile-web-app-capable" content="yes"/)
    assert.match(index, /<meta name="apple-mobile-web-app-capable" content="yes"/)
    assert.match(index, /<meta name="apple-mobile-web-app-title" content="中奥致远赛事管理系统"/)
    assert.match(index, /<link rel="apple-touch-icon" href="\/icons\/arcspro-icon-180\.png"/)

    const manifest = JSON.parse(read('public/manifest.webmanifest'))
    assert.equal(manifest.name, '中奥致远赛事管理系统')
    assert.equal(manifest.short_name, '中奥致远')
    assert.match(manifest.description, /中奥致远赛事管理系统/)
    assert.equal(manifest.start_url, '/app')
    assert.equal(manifest.scope, '/')
    assert.equal(manifest.display, 'standalone')
    assert.equal(manifest.orientation, 'portrait-primary')
    assert.equal(manifest.theme_color, '#D4A017')
    assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose.includes('maskable')))
    assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose.includes('maskable')))
  })

  it('registers a dedicated app service worker without replacing the map tile worker', () => {
    const main = read('src/main.jsx')
    assert.match(main, /import '\.\/registerPwa'/)

    const registerPwa = read('src/registerPwa.js')
    assert.match(registerPwa, /APP_SERVICE_WORKER_URL = '\/arcspro-app-sw\.js'/)
    assert.match(registerPwa, /navigator\.serviceWorker\.register\(APP_SERVICE_WORKER_URL\)/)
    assert.match(registerPwa, /cleanupLocalAppShellServiceWorkers/)
    assert.match(registerPwa, /beforeinstallprompt/)

    const serviceWorker = read('public/arcspro-app-sw.js')
    assert.match(serviceWorker, /ARCSPRO_APP_CACHE/)
    assert.match(serviceWorker, /\/manifest\.webmanifest/)
    assert.match(serviceWorker, /\/app/)
    assert.match(serviceWorker, /isLocalPreviewWorker/)
    assert.match(serviceWorker, /self\.registration\.unregister/)
    assert.doesNotMatch(serviceWorker, /sw-tiles\.js/)
  })

  it('renders an app-like mobile shell with bottom navigation and install guidance', () => {
    const appLayout = read('src/components/app/AppLayout.jsx')
    const appCss = read('src/components/app/app-layout.css')
    const h5Css = read('src/components/app/app-h5-surface.css')

    assert.match(appLayout, /workspace-mobile-dock/)
    assert.match(appLayout, /workspace-mobile-menu/)
    assert.match(appLayout, /mobileDrawerOpen/)
    assert.match(appLayout, /installPromptState/)
    assert.match(appLayout, /添加到桌面/)
    assert.match(appLayout, /workspace-main__install-copy/)
    assert.match(appLayout, /workspace-main__install-hint/)
    assert.match(appLayout, /一键安装到桌面/)
    assert.match(appLayout, /添加到主屏幕/)
    assert.match(appLayout, /primaryKeys = \['dashboard', 'reimbursement', 'import', 'inventory-workbench'\]/)
    assert.doesNotMatch(appLayout, /return \(primaryItems\.length >= 4 \? primaryItems : flatNavItems\)\.slice\(0, 4\)[\s\S]*return \(primaryItems\.length >= 4 \? primaryItems : flatNavItems\)\.slice\(0, 4\)/)

    assert.match(appCss, /@media \(max-width: 768px\)/)
    assert.match(appCss, /\.workspace-mobile-dock/)
    assert.match(appCss, /padding-bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\)/)
    assert.match(appCss, /\.workspace-mobile-menu/)
    assert.match(appCss, /\.workspace-main__install-btn[\s\S]*min-height: 44px/)
    assert.match(appCss, /\.workspace-main__topbar-btn,[\s\S]*\.context-square-entry__trigger,[\s\S]*\.workspace-main__topbar-avatar[\s\S]*width: 44px;[\s\S]*height: 44px/)
    assert.match(h5Css, /\.app-h5-tabs[\s\S]*overflow-x: auto/)
    assert.match(h5Css, /\.app-h5-tabs__tab[\s\S]*min-height: 44px/)
    assert.doesNotMatch(h5Css, /\.app-h5-tabs \{\s*display: grid;\s*grid-template-columns: 1fr;/)
  })

  it('ships app icons referenced by metadata', () => {
    const iconPaths = [
      'public/icons/arcspro-icon.svg',
      'public/icons/arcspro-icon-180.png',
      'public/icons/arcspro-icon-192.png',
      'public/icons/arcspro-icon-512.png',
    ]

    for (const iconPath of iconPaths) {
      assert.equal(existsSync(fromRoot(iconPath)), true, iconPath + ' should exist')
    }
  })
})
