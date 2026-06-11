# WebGPU 迁移检查清单

**创建日期**: 2026-03-26
**项目**: arcspro-event-manage-system (3D 资产管理器)

---

## 材质迁移

### MeshStandardMaterial → MeshStandardNodeMaterial

- [ ] `src/components/asset-designer/AssetDesignerCanvas.jsx`
  - 行 101: Ghost 预览材质
  - 行 148: 地板材质
  - 行 189: 分区材质
  - 行 232: 货架材质

- [ ] `src/components/asset-designer/PrefabMesh.jsx`
  - 行 47: 悬停 fallback 材质

- [ ] `src/data/prefabs/EuropeanTent.jsx`
  - 行 37: 立柱材质
  - 行 44: 锥顶篷布材质
  - 行 56: 底部围布材质
  - 行 73: 顶尖装饰材质

- [ ] `src/components/inventory/TwinSceneCanvas.jsx`
  - 行 55: 地板材质
  - 行 97: 货架材质
  - 行 130: 库位材质
  - 行 161: 圆桶物体材质
  - 行 169: 箱体物体材质

### MeshBasicMaterial → MeshBasicNodeMaterial

- [ ] `src/components/asset-designer/PrefabMesh.jsx`
  - 行 61: 选中高亮线框材质

### LineBasicMaterial 处理

⚠️ WebGPU 下 LineBasicMaterial 支持有限，需要寻找替代方案：

- [ ] `src/components/asset-designer/AssetDesignerCanvas.jsx`
  - 行 152: 仓库外壳线框

- [ ] `src/data/prefabs/EuropeanTent.jsx`
  - 行 50: 锥顶线框
  - 行 67: 围布线框

- [ ] `src/components/inventory/TwinSceneCanvas.jsx`
  - 行 59: 仓库外壳线框

---

## 渲染器切换

### Canvas 配置修改

- [ ] 修改 `AssetDesignerCanvas.jsx` Canvas gl prop
  ```jsx
  // 改为异步工厂函数
  gl={async (canvas) => {
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
    await renderer.init()
    return renderer
  }}
  ```

- [ ] 修改 `TwinSceneCanvas.jsx` Canvas gl prop

### 导入修改

- [ ] 修改 Three.js 导入
  ```jsx
  // 从
  import * as THREE from 'three'
  // 改为
  import * as THREE from 'three/webgpu'
  ```

- [ ] 注册 WebGPU 节点类型
  ```jsx
  import { extend } from '@react-three/fiber'
  extend(THREE)
  ```

---

## 组件验证

### @react-three/drei 组件

- [ ] `OrbitControls` - 验证 v10 API 变化
- [ ] `Grid` - 验证 WebGPU 兼容性
- [ ] `Bounds` - 验证功能正常
- [ ] `Edges` - 验证 WebGPU 兼容性
- [ ] `Html` - 验证功能正常
- [ ] `Line` - 验证 WebGPU 兼容性（可能需要替代方案）
- [ ] `Environment` - 验证功能正常
- [ ] `Stats` - 验证功能正常
- [ ] `Text` - 验证 WebGPU 兼容性

---

## Breaking Changes 处理

### Three.js r160 → r171 Breaking Changes

- [ ] 着色器 uniform 格式变更（如有自定义着色器）
- [ ] WebGLRenderer API 废弃检查
- [ ] BufferGeometry 变更检查

### fog 实现变化

- [ ] 验证 `<fog attach="fog" ... />` 在 WebGPU 下正常工作
- [ ] 检查背景色与 fog 颜色同步

---

## 依赖版本升级

```bash
npm install three@^0.171.0
npm install @react-three/fiber@^9 @react-three/drei@^10
```

- [ ] 升级 three
- [ ] 升级 @react-three/fiber
- [ ] 升级 @react-three/drei
- [ ] 验证 npm install 无错误
- [ ] 验证项目可启动

---

## 回归测试

### 仓库模式

- [ ] 货架渲染正常
- [ ] 分区渲染正常
- [ ] 选择高亮正常
- [ ] 油漆桶模式正常
- [ ] 灯光/阴影正常
- [ ] 明暗主题切换正常

### 户外赛事模式

- [ ] 预制物渲染正常（6 种）
- [ ] Grid 地面正常
- [ ] OrbitControls 正常

### 数字孪生视图

- [ ] 库位渲染正常
- [ ] 物体渲染正常
- [ ] 视图切换正常