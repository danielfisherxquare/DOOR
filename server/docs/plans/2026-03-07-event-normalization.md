# Event Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将系统中所有不规范的比赛项目名称统一规范化为"马拉松"或"半程马拉松"，同时保留自定义项目扩展能力。

**Architecture:** 后端新建共享工具 `event-normalizer.js`，在数据导入和赛事配置两个入口做规范化；前端新建 `eventUtils.ts` 统一所有 event 判断逻辑；DB Migration 清洗历史数据；`getPrepStats` 改为动态 GROUP BY。

**Tech Stack:** Node.js (ESM) / Knex / PostgreSQL / React / TypeScript

---

### Task 1: 后端共享工具 — 新建 `event-normalizer.js`

**Files:**
- Create: `door/server/src/utils/event-normalizer.js`

**Step 1: 创建共享工具文件**

```javascript
// door/server/src/utils/event-normalizer.js
const HALF_ALIASES = ['half marathon', 'half', '21.0975km', '21km', '21k', '半程马拉松', '半程', '半马'];
const FULL_ALIASES = ['marathon', 'full', '42.195km', '42km', '42k', '全程马拉松', '全程', '全马'];

export function normalizeEvent(rawEvent) {
    const event = String(rawEvent || '').trim();
    if (!event) return '';
    const lower = event.toLowerCase();
    if (HALF_ALIASES.includes(lower)) return '半程马拉松';
    if (FULL_ALIASES.includes(lower)) return '马拉松';
    return event; // 自定义项目保持原样
}

export function isHalfEvent(event) {
    if (!event) return false;
    const v = String(event).trim().toLowerCase();
    return v.includes('半') || v.includes('half');
}

export function isFullEvent(event) {
    if (isHalfEvent(event)) return false;
    const v = String(event || '').trim().toLowerCase();
    return v.includes('马拉松') || v.includes('marathon') || v.includes('full') || v.includes('全');
}
```

**Step 2: 验证文件创建成功**

Run: `node -e "import('./src/utils/event-normalizer.js').then(m => { console.log(m.normalizeEvent('半马')); console.log(m.normalizeEvent('Full')); console.log(m.normalizeEvent('10K')); })"`
Cwd: `door/server`
Expected: 输出 `半程马拉松`、`马拉松`、`10K`

**Step 3: Commit**

```bash
git add door/server/src/utils/event-normalizer.js
git commit -m "feat(event): add shared event-normalizer utility"
```

---

### Task 2: 后端入口规范化 — 修改两个数据写入入口

**Files:**
- Modify: `door/server/src/modules/races/race.routes.js`
- Modify: `door/server/src/modules/import-sessions/commit-import-session.handler.js`

**Step 1: 修改 `race.routes.js`**

在文件顶部 import 区域添加：
```javascript
import { normalizeEvent } from '../../utils/event-normalizer.js';
```

找到 `normalizeEvents` 函数内部的 `name: String(e.name || '').trim()` 行，替换为：
```javascript
name: normalizeEvent(e.name),
```

**Step 2: 修改 `commit-import-session.handler.js`**

在文件顶部 import 区域添加：
```javascript
import { normalizeEvent } from '../../utils/event-normalizer.js';
```

找到 `mapRowToDbRecord` 函数中的 `event: row.event,` 行，替换为：
```javascript
event: normalizeEvent(row.event),
```

**Step 3: 验证后端启动无报错**

Run: `node -e "import('./src/modules/races/race.routes.js').then(() => console.log('race.routes OK')).catch(e => console.error(e))"`
Cwd: `door/server`
Expected: 无 import 错误

**Step 4: Commit**

```bash
git add door/server/src/modules/races/race.routes.js door/server/src/modules/import-sessions/commit-import-session.handler.js
git commit -m "feat(event): normalize event names at import and race config entry points"
```

---

### Task 3: 后端统计动态化 + 替换硬编码

**Files:**
- Modify: `door/server/src/modules/audit/audit.repository.js` (L14-63)
- Modify: `door/server/src/modules/pipeline/pipeline-config.repository.js` (L175-181)
- Modify: `door/server/src/modules/records/record.repository.js` (L350)

**Step 1: 重构 `audit.repository.js` 的 `getPrepStats`**

将 L14-63 的 `getPrepStats` 函数体完整替换为以下内容：

```javascript
export async function getPrepStats(orgId, raceId) {
    const rows = await knex('records')
        .where({ org_id: orgId, race_id: raceId })
        .groupBy('event')
        .select(
            'event',
            knex.raw("SUM(CASE WHEN lottery_status = '参与抽签' THEN 1 ELSE 0 END)::int AS participate"),
            knex.raw("SUM(CASE WHEN lottery_status IN ('直通名额','直通','强制保签') THEN 1 ELSE 0 END)::int AS direct"),
            knex.raw("SUM(CASE WHEN lottery_status IN ('不予通过','模糊剔除','未成年剔除','精英资质存疑','强制剔除') THEN 1 ELSE 0 END)::int AS denied"),
            knex.raw("SUM(CASE WHEN lottery_status IS NULL OR lottery_status = '' OR lottery_status NOT IN ('参与抽签','直通名额','直通','强制保签','不予通过','模糊剔除','未成年剔除','精英资质存疑','强制剔除') THEN 1 ELSE 0 END)::int AS pending"),
            knex.raw("COUNT(*)::int AS subtotal"),
        )
        .orderBy('event');

    const byEvent = {};
    let total = 0;
    for (const r of rows) {
        byEvent[r.event || '(未知)'] = {
            participate: r.participate || 0,
            direct: r.direct || 0,
            denied: r.denied || 0,
            pending: r.pending || 0,
            subtotal: r.subtotal || 0,
        };
        total += r.subtotal || 0;
    }
    return { byEvent, total };
}
```

**Step 2: 替换 `pipeline-config.repository.js` 的局部 `isHalfEvent`**

在文件顶部 import 区域添加：
```javascript
import { isHalfEvent } from '../../utils/event-normalizer.js';
```

删除 L175-181 的局部 `isHalfEvent` 函数定义（连同上方注释 L175-181 共 7 行）：
```javascript
// 删除以下内容:
/**
 * 判断项目是否为半程
 */
function isHalfEvent(event) {
    if (!event) return false;
    return event.includes('半') || event.toLowerCase().includes('half');
}
```

> ⚠️ L208 和 L217 的调用点无需修改，import 的共享函数签名兼容。

**Step 3: 替换 `record.repository.js` 的硬编码判断**

在文件顶部 import 区域添加：
```javascript
import { isHalfEvent } from '../../utils/event-normalizer.js';
```

找到 L350 的：
```javascript
const isHalf = res.event === 'Half' || res.event === '半马' || res.event === '半程';
```
替换为：
```javascript
const isHalf = isHalfEvent(res.event);
```

**Step 4: Commit**

```bash
git add door/server/src/modules/audit/audit.repository.js door/server/src/modules/pipeline/pipeline-config.repository.js door/server/src/modules/records/record.repository.js
git commit -m "refactor(event): dynamic GROUP BY in getPrepStats, replace hardcoded isHalfEvent"
```

---

### Task 4: 历史数据清洗 — 新建 DB Migration

**Files:**
- Create: `door/server/src/db/migrations/20260307000004_normalize_event_history.js`

**Step 1: 创建 Migration 文件**

```javascript
// door/server/src/db/migrations/20260307000004_normalize_event_history.js
const HALF_ALIASES = ['半马', '半程', 'Half', 'Half Marathon', '21.0975km', '21km', '21K'];
const FULL_ALIASES = ['全马', '全程', 'Full', 'Marathon', '42.195km', '42km', '42K'];

export async function up(knex) {
    // 清洗 records.event
    for (const alias of HALF_ALIASES) {
        await knex('records').where('event', alias).update({ event: '半程马拉松' });
    }
    for (const alias of FULL_ALIASES) {
        await knex('records').where('event', alias).update({ event: '马拉松' });
    }
    // 清洗 races.events JSONB
    const races = await knex('races').whereNotNull('events');
    for (const race of races) {
        const events = typeof race.events === 'string' ? JSON.parse(race.events) : race.events;
        if (!Array.isArray(events)) continue;
        let changed = false;
        const updated = events.map(e => {
            const name = String(e?.name || '').trim();
            const lower = name.toLowerCase();
            if (HALF_ALIASES.map(a => a.toLowerCase()).includes(lower)) { changed = true; return { ...e, name: '半程马拉松' }; }
            if (FULL_ALIASES.map(a => a.toLowerCase()).includes(lower)) { changed = true; return { ...e, name: '马拉松' }; }
            return e;
        });
        if (changed) await knex('races').where({ id: race.id }).update({ events: JSON.stringify(updated) });
    }
}

export async function down() { /* 不可逆 */ }
```

**Step 2: Commit（不运行 — 需要连接数据库时由用户手动执行）**

```bash
git add door/server/src/db/migrations/20260307000004_normalize_event_history.js
git commit -m "feat(event): add migration to normalize historical event data"
```

> ⚠️ Migration 的实际运行需连接生产/开发数据库，此步仅提交代码，待部署时执行 `npx knex migrate:latest`。

---

### Task 5: 前端共享工具 — 新建 `eventUtils.ts`

**Files:**
- Create: `tool/src/utils/eventUtils.ts`

**Step 1: 创建前端共享工具文件**

```typescript
// tool/src/utils/eventUtils.ts

/** 标准内部键（与 lotteryEngine 兼容） */
export type EventKey = 'Full' | 'Half';

/** 判断是否半程赛事 — 兼容各种历史写法 */
export function isHalfEvent(event: unknown): boolean {
    const v = String(event || '').trim().toLowerCase();
    return v.includes('半') || v.includes('half');
}

/** 判断是否全程赛事 */
export function isFullEvent(event: unknown): boolean {
    if (isHalfEvent(event)) return false;
    const v = String(event || '').trim().toLowerCase();
    return !v || v.includes('马拉松') || v.includes('marathon')
        || v.includes('full') || v.includes('全');
}

/** 将任意 event 归一为 lotteryEngine 内部键 'Full' | 'Half' */
export function toEventKey(event: unknown): EventKey {
    return isHalfEvent(event) ? 'Half' : 'Full';
}

/** 返回 event 的中英文显示名称 */
export function resolveEventDisplay(event: unknown): {
    eventKey: string; titleCn: string; titleEn: string;
} {
    const label = String(event || '').trim();
    if (!label) return { eventKey: '__unspecified__', titleCn: '未指定', titleEn: 'Unspecified' };
    if (isHalfEvent(label)) return { eventKey: 'Half', titleCn: '半程马拉松', titleEn: 'Half Marathon' };
    if (isFullEvent(label)) return { eventKey: 'Full', titleCn: '马拉松', titleEn: 'Marathon' };
    return { eventKey: label.toLowerCase(), titleCn: label, titleEn: label };
}
```

**Step 2: 类型检查**

Run: `npx tsc --noEmit`
Cwd: `tool`
Expected: 无新增错误

**Step 3: Commit**

```bash
git add tool/src/utils/eventUtils.ts
git commit -m "feat(event): add frontend shared eventUtils"
```

---

### Task 6: 前端 lottery 模块 — 5 个文件修改

**Files:**
- Modify: `tool/src/utils/lotteryEngine.ts` (L153, L294)
- Modify: `tool/src/components/lottery/InventoryMatcher.tsx` (L396, L593)
- Modify: `tool/src/components/lottery/GenderRatioConfig.tsx` (L22-29)
- Modify: `tool/src/components/lottery/CapacityPlanner.tsx` (L243, L330)
- Modify: `tool/src/components/lottery/LotteryPrep.tsx` (适配 `byEvent`)
- Modify: `tool/src/services/types.ts` (更新 `AuditPrepStats` 类型)
- Modify: `tool/src/components/ListProcessingView.tsx` (L25-28 更新默认值)

**Step 1: 修改 `lotteryEngine.ts`**

在文件顶部 import 区域添加：
```typescript
import { isHalfEvent } from './eventUtils';
```

找到 L153-156 的 `normalizeLotteryEventKey` 函数，将函数体替换为：
```typescript
function normalizeLotteryEventKey(eventName: string): 'Full' | 'Half' {
  return isHalfEvent(eventName) ? 'Half' : 'Full';
}
```

找到 L294 的：
```typescript
const isHalf = runner.event === 'Half';
```
替换为：
```typescript
const isHalf = isHalfEvent(runner.event);
```

**Step 2: 修改 `InventoryMatcher.tsx`**

在文件顶部 import 区域添加：
```typescript
import { resolveEventDisplay } from '../../utils/eventUtils';
```

找到所有 `ek === 'Full' ? '🏃 马拉松' : '🏃‍♂️ 半程马拉松'` 类似的硬编码标签，替换为：
```typescript
const { titleCn } = resolveEventDisplay(ek);
const label = `🏃 ${titleCn}`;
```

> `EVENT_KEYS = ['Full', 'Half']` 保持不变。

**Step 3: 修改 `GenderRatioConfig.tsx`**

在文件顶部 import 区域添加：
```typescript
import { toEventKey } from '../../utils/eventUtils';
```

找到 `normalizeTargetGroup` 函数，将函数体最后的三行（两个 if 和 return）替换为：
```typescript
function normalizeTargetGroup(value?: string): 'ALL' | 'Full' | 'Half' {
    const raw = String(value || '').trim();
    if (!raw) return 'ALL';
    if (raw.toUpperCase() === 'ALL') return 'ALL';
    return toEventKey(raw);
}
```

**Step 4: 修改 `CapacityPlanner.tsx`**

在文件顶部 import 区域添加：
```typescript
import { isHalfEvent, toEventKey } from '../../utils/eventUtils';
```

找到 L243 的 emoji 判断，替换为：
```typescript
const eventEmoji = isHalfEvent(row.event) ? '🏃‍♀️' : '🏃';
```

找到 L330 的 eventId prop，替换为：
```typescript
eventId={toEventKey(row.event)}
```

**Step 5: 修改 `LotteryPrep.tsx` — 适配新的 `getPrepStats` 返回结构**

找到渲染 `stats.full` / `stats.half` 的 StatCard 组件调用，替换为动态遍历：
```tsx
{stats.byEvent && Object.entries(stats.byEvent).map(([event, data]) => (
    <StatCard key={event} title={event} data={data} />
))}
```

**Step 6: 更新 `AuditPrepStats` 类型定义**

在 `tool/src/services/types.ts` 中找到 `AuditPrepStats` 类型定义，更新为：
```typescript
export interface AuditPrepStats {
    byEvent: Record<string, {
        participate: number;
        direct: number;
        denied: number;
        pending: number;
        subtotal: number;
    }>;
    total: number;
}
```

**Step 7: 更新 `ListProcessingView.tsx` 的 `EMPTY_PREP_STATS` 默认值**

找到 L25-28 的：
```typescript
const EMPTY_PREP_STATS: AuditPrepStats = {
    full: { total: 0, participate: 0, direct: 0, denied: 0, pending: 0 },
    half: { total: 0, participate: 0, direct: 0, denied: 0, pending: 0 },
    total: 0,
};
```
替换为：
```typescript
const EMPTY_PREP_STATS: AuditPrepStats = {
    byEvent: {},
    total: 0,
};
```

**Step 8: 类型检查**

Run: `npx tsc --noEmit`
Cwd: `tool`
Expected: 无新增错误

**Step 9: Commit**

```bash
git add tool/src/utils/lotteryEngine.ts tool/src/components/lottery/ tool/src/services/types.ts tool/src/components/ListProcessingView.tsx
git commit -m "refactor(event): use shared eventUtils across lottery module"
```

---

### Task 7: 前端 bib 模块 — 3 个文件修改

**Files:**
- Modify: `tool/src/components/bib/zoneAllocator.ts`
- Modify: `tool/src/components/bib/numberingEngine.ts`
- Modify: `tool/src/components/bib/BibExecution.tsx`

**Step 1: 修改 `zoneAllocator.ts`**

在文件顶部 import 区域添加：
```typescript
import { isHalfEvent, resolveEventDisplay } from '../../utils/eventUtils';
```

找到并删除文件中独立定义的 `isHalfEvent` 函数（约 10 行）和 `resolveEventDisplay` 函数（约 15 行）。

> ⚠️ 确认调用点签名兼容。共享版 `resolveEventDisplay` 返回 `{ eventKey, titleCn, titleEn }`。如果本地版返回的字段名不同（如 `key` 而非 `eventKey`），需要在调用处适配。

**Step 2: 修改 `numberingEngine.ts`**

在文件顶部 import 区域添加：
```typescript
import { isHalfEvent } from '../../utils/eventUtils';
```

找到并删除文件中独立定义的 `isHalfEvent` 函数（约 5 行）。

**Step 3: 修改 `BibExecution.tsx`**

在文件顶部 import 区域添加：
```typescript
import { resolveEventDisplay } from '../../utils/eventUtils';
```

找到并删除文件中独立定义的 `resolveEventDisplay` 函数（约 15 行）。

**Step 4: 类型检查**

Run: `npx tsc --noEmit`
Cwd: `tool`
Expected: 无新增错误

**Step 5: Commit**

```bash
git add tool/src/components/bib/
git commit -m "refactor(event): replace bib module local event utils with shared eventUtils"
```

---

### Checkpoint: 全量验证

**Step 1: 后端测试**

Run: `node --test`
Cwd: `door/server`
Expected: 全部通过

**Step 2: 前端类型检查**

Run: `npx tsc --noEmit`
Cwd: `tool`
Expected: 无错误

**Step 3: 最终 Commit**

如果上述都通过，当前分支所有改动已正确提交，可准备部署。

> ⚠️ 部署顺序：先跑 Migration (`npx knex migrate:latest`) → 部署后端 → 部署前端 → 回归验证
