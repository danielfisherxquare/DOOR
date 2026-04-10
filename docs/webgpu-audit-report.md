# WebGPU 升级审计报告

**审计日期**: 2026-03-26
**审计范围**: door 项目 3D 渲染相关代码
**审计目的**: 评估 Three.js 0.160 → 0.171+ 升级及 WebGPU 迁移的可行性与风险

---

## 1. 现状概览

### 当前依赖版本

| 依赖 | 当前版本 | 目标版本 | 跨越版本 |
|-----|---------|---------|---------|
| three | ^0.160.1 | ≥0.171 | 11 个次版本 |
| @react-three/fiber | ^8.18.0 | ≥9.x | 1 个主版本 |
| @react-three/drei | ^9.122.0 | ≥10.x | 1 个主版本 |

### 代码规模统计

| 类别 | 文件数 | 使用次数 |
|-----|-------|---------|
| 3D 渲染组件 | 4 个核心文件 | - |
| 预制物定义 | 6 个文件 | - |
| 材质使用 | - | 13 处 |
| Geometry 使用 | - | 19 处 |
| drei 组件使用 | - | 10 种 |

---

## 2. API 使用详细清单

### 2.1 材质类型 (Materials)

| 材质类型 | 使用位置 | 次数 | 兼容性评估 |
|---------|---------|------|-----------|
| `MeshStandardMaterial` | 见下表 | 12 | ✅ 需迁移到 NodeMaterial 变体 |
| `MeshBasicMaterial` | PrefabMesh.jsx:61 | 1 | ✅ 需迁移到 MeshBasicNodeMaterial |
| `LineBasicMaterial` | 3 个文件 | 3 | ⚠️ WebGPU 支持有限，需替代方案 |

**MeshStandardMaterial 详细位置**:

| 文件 | 行号 | 用途 |
|-----|-----|-----|
| AssetDesignerCanvas.jsx | 101 | Ghost 预览材质 |
| AssetDesignerCanvas.jsx | 148 | 地板材质 |
| AssetDesignerCanvas.jsx | 189 | 分区材质 |
| AssetDesignerCanvas.jsx | 232 | 货架材质 |
| PrefabMesh.jsx | 47 | 悬停 fallback 材质 |
| EuropeanTent.jsx | 37 | 立柱材质 |
| EuropeanTent.jsx | 44 | 锥顶篷布材质 |
| EuropeanTent.jsx | 56 | 底部围布材质 |
| EuropeanTent.jsx | 73 | 顶尖装饰材质 |
| TwinSceneCanvas.jsx | 55 | 地板材质 |
| TwinSceneCanvas.jsx | 97 | 货架材质 |
| TwinSceneCanvas.jsx | 130 | 库位材质 |
| TwinSceneCanvas.jsx | 161, 169 | 物体材质 |

### 2.2 Geometry 类型

| Geometry 类型 | 使用文件 | 兼容性 |
|--------------|---------|--------|
| `BoxGeometry` | AssetDesignerCanvas, PrefabMesh, EuropeanTent, TwinSceneCanvas | ✅ 完全兼容 |
| `CylinderGeometry` | EuropeanTent, TwinSceneCanvas | ✅ 完全兼容 |
| `ConeGeometry` | EuropeanTent | ✅ 完全兼容 |
| `SphereGeometry` | EuropeanTent | ✅ 完全兼容 |
| `PlaneGeometry` | AssetDesignerCanvas, TwinSceneCanvas | ✅ 完全兼容 |
| `EdgesGeometry` | AssetDesignerCanvas, EuropeanTent, TwinSceneCanvas | ✅ 完全兼容 |

### 2.3 灯光与效果

| 类型 | 使用文件 | 兼容性 |
|-----|---------|--------|
| `ambientLight` | AssetDesignerCanvas, TwinSceneCanvas | ✅ 完全兼容 |
| `directionalLight` | AssetDesignerCanvas, TwinSceneCanvas | ✅ 完全兼容 |
| `pointLight` | AssetDesignerCanvas, TwinSceneCanvas | ✅ 完全兼容 |
| `fog` | AssetDesignerCanvas, TwinSceneCanvas | ⚠️ WebGPU 实现略有不同 |

### 2.4 @react-three/drei 组件

| 组件 | 使用文件 | 兼容性评估 |
|-----|---------|-----------|
| `OrbitControls` | AssetDesignerCanvas, TwinSceneCanvas, TentCapacityTool, Scene | ✅ 需检查 v10 API |
| `Grid` | AssetDesignerCanvas, TwinSceneCanvas | ⚠️ 需验证 WebGPU |
| `Bounds` | AssetDesignerCanvas, TwinSceneCanvas | ✅ 应兼容 |
| `Edges` | AssetDesignerCanvas | ✅ 应兼容 |
| `Html` | TentCapacityTool | ✅ 应兼容 |
| `Line` | TentCapacityTool | ⚠️ 需验证 |
| `Environment` | Scene | ✅ 应兼容 |
| `Stats` | Scene | ✅ 应兼容 |
| `Text` | GameDebugInfo | ⚠️ 需验证 |

---

## 3. 风险评估

### 🔴 高风险
- **无**

### 🟡 中风险

| 风险项 | 说明 | 缓解措施 |
|-------|------|---------|
| drei v10 API 变更 | 主版本升级可能有破坏性变更 | 逐一验证组件，查 changelog |
| LineBasicMaterial 兼容性 | WebGPU 下线条渲染支持有限 | 使用 Mesh 替代或 three/examples 的 Line2 |
| fog 实现差异 | WebGPU 的 fog 实现可能与 WebGL 不同 | 测试验证，必要时调整参数 |

### 🟢 低风险

| 项目 | 说明 |
|-----|------|
| Geometry 类型 | 所有几何体类型完全兼容 |
| 灯光类型 | 三种灯光类型兼容良好 |
| three-mesh-bvh | 项目未直接使用，仅 drei 内部依赖 |
| 自定义着色器 | 项目未使用自定义 ShaderMaterial |

---

## 4. 关键文件清单

### 核心渲染组件

1. **`src/components/asset-designer/AssetDesignerCanvas.jsx`**
   - 主要 3D 场景渲染
   - 仓库模式、户外赛事模式
   - 包含最多的材质和 Geometry 使用

2. **`src/components/asset-designer/PrefabMesh.jsx`**
   - 预制物实例渲染
   - 选中高亮处理

3. **`src/components/inventory/TwinSceneCanvas.jsx`**
   - 数字孪生视图
   - 库位、物体渲染

### 预制物定义文件

| 文件 | 预制物 |
|-----|-------|
| EuropeanTent.jsx | 欧式尖顶帐篷 |
| SunUmbrella.jsx | 阳伞 |
| CrowdBarrier.jsx | 围栏 |
| RosenbergTent.jsx | 罗森堡帐篷 |
| ModularStage.jsx | 模块化舞台 |
| TrussSegment.jsx | 桁架段 |

---

## 5. 建议迁移顺序

```
Phase 1.1: 升级依赖
    │
    ▼
Phase 1.2: 切换渲染器（保持 WebGL 回退）
    │
    ▼
Phase 1.3: 逐个迁移材质到 NodeMaterial
    │
    ▼
Phase 1.4: 验证 drei 组件
    │
    ▼
Phase 1.5: 处理边缘情况
```

---

## 6. three-mesh-bvh 兼容性

- **当前状态**: 项目代码未直接使用 `three-mesh-bvh`
- **间接依赖**: `@react-three/drei` v9 内部使用（MeshRefractionMaterial）
- **升级影响**: drei v10 已适配最新 three-mesh-bvh，无需额外处理
- **风险等级**: 🟢 低

---

## 7. 总结

| 类别 | 数量 | 风险等级 |
|-----|------|---------|
| 需迁移材质 | 13 处 | 🟡 中 |
| Geometry 类型 | 6 种 | 🟢 低 |
| drei 组件 | 10 个 | 🟡 中 |
| 灯光/效果 | 4 种 | 🟢 低 |
| 直接 BVH 使用 | 0 处 | 🟢 低 |

**整体风险评估**: 🟡 **中等风险**

升级可行，主要工作量在于：
1. 验证 drei v10 组件兼容性
2. 迁移材质到 NodeMaterial 变体
3. 解决 LineBasicMaterial 替代方案

---

## 附录：参考资源

- [Three.js WebGPU 迁移指南](https://threejs.org/docs/#api/en/renderers/WebGPURenderer)
- [Three.js r160-r171 Changelog](https://github.com/mrdoob/three.js/releases)
- [@react-three/fiber v9 文档](https://docs.pmnd.rs/react-three-fiber)
- [@react-three/drei v10 文档](https://github.com/pmndrs/drei)