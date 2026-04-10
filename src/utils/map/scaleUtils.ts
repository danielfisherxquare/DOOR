/**
 * 比例计算工具
 * 用于计算模型在 Cesium 地图上的实际尺寸与缩放比例
 */

import * as Cesium from 'cesium';

/**
 * 地球半径（米）
 */
const EARTH_RADIUS = 6378137;

/**
 * 计算指定纬度处 1 度经度对应的米数
 * @param latitude 纬度（度）
 */
export function metersPerDegreeLongitude(latitude: number): number {
  const latRad = Cesium.Math.toRadians(latitude);
  return (Math.PI / 180) * EARTH_RADIUS * Math.cos(latRad);
}

/**
 * 计算指定纬度处 1 度纬度对应的米数
 */
export function metersPerDegreeLatitude(): number {
  return (Math.PI / 180) * EARTH_RADIUS;
}

/**
 * 计算模型在地图上的实际尺寸（米）
 * Cesium 中 1 单位 = 1 米，scale 直接影响渲染尺寸
 *
 * @param scale 当前缩放比例
 * @param modelBoundingSize 模型包围盒尺寸（单位：模型单位）
 * @param latitude 纬度（用于未来可能的经度校正）
 */
export function calculateRealSizeFromScale(
  scale: number,
  modelBoundingSize: { x: number; y: number; z: number },
  _latitude?: number
): { widthMeters: number; depthMeters: number; heightMeters: number } {
  return {
    widthMeters: modelBoundingSize.x * scale,
    depthMeters: modelBoundingSize.y * scale,
    heightMeters: modelBoundingSize.z * scale,
  };
}

/**
 * 计算达到目标真实尺寸所需的缩放比例
 * @param targetSizeMeters 目标尺寸（米）
 * @param modelBoundingSize 模型包围盒尺寸（模型单位）
 */
export function calculateScaleForTargetSize(
  targetSizeMeters: number,
  modelBoundingSize: number
): number {
  if (modelBoundingSize <= 0) return 1;
  return targetSizeMeters / modelBoundingSize;
}

/**
 * 计算两点之间的地面距离（米）
 * @param lon1 起点经度
 * @param lat1 起点纬度
 * @param lon2 终点经度
 * @param lat2 终点纬度
 */
export function calculateGroundDistance(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const geodesic = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(lon1, lat1),
    Cesium.Cartographic.fromDegrees(lon2, lat2)
  );
  return geodesic.surfaceDistance;
}

/**
 * 默认模型尺寸（假设模型单位为 1 米）
 * 实际使用时应从模型元数据获取真实尺寸
 */
export const DEFAULT_MODEL_SIZE = { x: 1, y: 1, z: 1 };

/**
 * 从模型 URL 提取或推断模型尺寸
 * 这是一个简化实现，实际应从 glTF 元数据读取
 * @param modelUrl 模型 URL
 */
export function inferModelSize(modelUrl: string): { x: number; y: number; z: number } {
  // 如果是用户上传的模型，假设其原始单位为米
  // 对于其他来源的模型，可能需要不同的默认值

  const lowerUrl = modelUrl.toLowerCase();

  // 检测是否是已知类型的模型
  if (lowerUrl.includes('warehouse') || lowerUrl.includes('building')) {
    // 建筑类模型，假设尺寸较大
    return { x: 10, y: 10, z: 10 };
  }

  if (lowerUrl.includes('container') || lowerUrl.includes('shelf')) {
    // 容器/货架类模型
    return { x: 2, y: 1, z: 2 };
  }

  // 默认：假设模型原始单位为 1 米
  return DEFAULT_MODEL_SIZE;
}

/**
 * 格式化尺寸显示
 * @param meters 尺寸（米）
 */
export function formatSize(meters: number): string {
  if (meters < 1) {
    return `${Math.round(meters * 100)}cm`;
  }
  if (meters < 1000) {
    return `${meters.toFixed(1)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}