import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const fixtures = [
  {
    path: resolve('tests/reimbursement/fixtures/invoice-sample.jpg'),
    type: 'jpeg',
    background: '#fffdf7',
    accent: '#b42318',
    eyebrow: '增值税电子普通发票',
    title: '测试发票（仅用于 ArcSpro 验收）',
    rows: [
      ['发票代码', 'TEST20260711'],
      ['发票号码', 'INV-2026-0711-001'],
      ['开票日期', '2026-07-11'],
      ['购买方', '中奥致远赛事管理验收组'],
      ['销售方', 'ArcSpro 验收供应商'],
      ['项目名称', '赛事车辆调度服务'],
      ['价税合计', '¥128.50'],
    ],
  },
  {
    path: resolve('tests/reimbursement/fixtures/payment-receipt.png'),
    type: 'png',
    background: '#f4fbff',
    accent: '#067647',
    eyebrow: '付款凭证',
    title: '测试付款记录（仅用于 ArcSpro 验收）',
    rows: [
      ['付款时间', '2026-07-11 10:30:00'],
      ['交易单号', 'PAY-2026-0711-001'],
      ['付款方', '中奥致远赛事管理验收组'],
      ['收款方', 'ArcSpro 验收供应商'],
      ['付款说明', '赛事车辆调度服务'],
      ['付款金额', '¥128.50'],
      ['交易状态', '支付成功'],
    ],
  },
]

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })

try {
  for (const fixture of fixtures) {
    await mkdir(dirname(fixture.path), { recursive: true })
    const rows = fixture.rows.map(([label, value]) => (
      `<div class="row"><span>${label}</span><strong>${value}</strong></div>`
    )).join('')
    await page.setContent(`
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              width: 800px;
              height: 600px;
              padding: 48px;
              background: ${fixture.background};
              color: #182230;
              font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
            }
            main { height: 100%; border: 3px solid ${fixture.accent}; padding: 32px 42px; background: white; }
            .eyebrow { color: ${fixture.accent}; font-size: 18px; font-weight: 700; letter-spacing: .14em; }
            h1 { margin: 10px 0 24px; font-size: 30px; }
            .row { display: grid; grid-template-columns: 150px 1fr; padding: 10px 0; border-bottom: 1px solid #d0d5dd; font-size: 18px; }
            .row span { color: #667085; }
            .row strong { text-align: right; }
            footer { margin-top: 20px; color: #667085; font-size: 14px; text-align: center; }
          </style>
        </head>
        <body>
          <main>
            <div class="eyebrow">${fixture.eyebrow}</div>
            <h1>${fixture.title}</h1>
            ${rows}
            <footer>此票据不代表真实交易，不得用于财务报销。</footer>
          </main>
        </body>
      </html>
    `)
    await page.screenshot({
      path: fixture.path,
      type: fixture.type,
      quality: fixture.type === 'jpeg' ? 92 : undefined,
    })
  }
} finally {
  await browser.close()
}
