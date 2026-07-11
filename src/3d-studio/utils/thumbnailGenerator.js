/**
 * Thumbnail Generator
 * 使用 Three.js 为 GLB/GLTF 模型生成缩略图
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import request from '../../utils/request';

/**
 * 从模型文件生成缩略图
 * @param {File|Blob|ArrayBuffer} source - 模型文件
 * @param {Object} options
 * @param {number} options.width - 缩略图宽度 (default: 128)
 * @param {number} options.height - 缩略图高度 (default: 128)
 * @param {string} options.background - 背景颜色 (default: '#1e1e2e')
 * @returns {Promise<string>} - base64 data URL
 */
export async function generateThumbnail(source, options = {}) {
    const {
        width = 128,
        height = 128,
        background = '#1e1e2e',
    } = options;

    // 创建离屏渲染器
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setClearColor(background, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 创建场景
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    // 相机
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(2, 2, 2);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-5, -5, -5);
    scene.add(backLight);

    // 加载模型
    const loader = new GLTFLoader();

    let model;
    try {
        if (source instanceof File || source instanceof Blob) {
            const arrayBuffer = await source.arrayBuffer();
            model = await loader.parseAsync(arrayBuffer, '');
        } else if (source instanceof ArrayBuffer) {
            model = await loader.parseAsync(source, '');
        } else {
            throw new Error('不支持的源类型');
        }
    } catch (error) {
        // 清理资源
        renderer.dispose();
        throw error;
    }

    scene.add(model.scene);

    // 自动计算相机位置
    const box = new THREE.Box3().setFromObject(model.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.sin(fov / 2));
    cameraZ *= 1.5; // 一些额外空间

    camera.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.3, center.z + cameraZ);
    camera.lookAt(center);

    // 渲染
    renderer.render(scene, camera);

    // 获取 canvas 数据
    const dataUrl = renderer.domElement.toDataURL('image/png');

    // 清理资源
    scene.traverse((object) => {
        if (object.geometry) {
            object.geometry.dispose();
        }
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach((m) => m.dispose());
            } else {
                object.material.dispose();
            }
        }
    });
    renderer.dispose();

    return dataUrl;
}

/**
 * 为资产生成并上传缩略图
 * @param {string} assetId - 资产 ID
 * @param {File|Blob|ArrayBuffer} source - 模型文件
 * @param {string} orgId - 组织 ID
 * @returns {Promise<void>}
 */
export async function generateAndUploadThumbnail(assetId, source, orgId) {
    const thumbnail = await generateThumbnail(source);

    // 上传缩略图
    await request.post(`/app/3d-studio/assets/${assetId}/thumbnail${orgId ? `?orgId=${orgId}` : ''}`, { thumbnail });

    return thumbnail;
}

export default {
    generateThumbnail,
    generateAndUploadThumbnail,
};
