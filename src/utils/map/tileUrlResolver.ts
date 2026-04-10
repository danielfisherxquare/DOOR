/**
 * 瓦片 URL 模板解析
 */

const GALILEO_SERVERS = ['Galileo', 'Galileo1', 'Galileo2', 'Galileo3'];
let galileoIdx = 0;

/**
 * 解析瓦片 URL 模板
 */
export function resolveTileUrl(
  template: string,
  x: number,
  y: number,
  z: number,
  options: {
    subdomains?: string;
    apiKey?: string;
  } = {}
): string {
  const { subdomains = 'abc', apiKey = '' } = options;
  const safeSubdomains = subdomains.length > 0 ? subdomains : 'abc';
  const s = safeSubdomains[Math.abs(x + y) % safeSubdomains.length];
  galileoIdx = (galileoIdx + 1) % GALILEO_SERVERS.length;

  // 计算 QuadKey (Bing Maps)
  let quadkey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit.toString();
  }

  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  return template
    .replace(/\{\$x\}/gi, String(x))
    .replace(/\{\$y\}/gi, String(y))
    .replace(/\{\$z\}/gi, String(z))
    .replace(/\{x\}/gi, String(x))
    .replace(/\{y\}/gi, String(y))
    .replace(/\{z\}/gi, String(z))
    .replace(/\{s\}/gi, s)
    .replace(/\{\$Galileo\}/gi, GALILEO_SERVERS[galileoIdx])
    .replace(/\{quadkey\}/gi, quadkey)
    .replace(/\{r\}/gi, dpr > 1 ? '@2x' : '')
    .replace(/\{api_key\}/gi, apiKey);
}

/**
 * 批量解析瓦片 URL
 */
export function resolveTileUrls(
  template: string,
  tiles: Array<{ z: number; x: number; y: number }>,
  options?: {
    subdomains?: string;
    apiKey?: string;
  }
): Map<string, string> {
  const result = new Map<string, string>();

  for (const tile of tiles) {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    const url = resolveTileUrl(template, tile.x, tile.y, tile.z, options);
    result.set(key, url);
  }

  return result;
}

/**
 * 检查 URL 模板是否需要特殊处理
 */
export function hasCustomTemplateTokens(template: string): boolean {
  return (
    /\{\$x\}|\{\$y\}|\{\$z\}|\{\$Galileo\}|\{quadkey\}|\{r\}|\{api_key\}/i.test(template)
  );
}

/**
 * 获取子域名
 */
export function getSubdomain(x: number, y: number, subdomains: string): string {
  if (!subdomains || subdomains.length === 0) return 'a';
  return subdomains[Math.abs(x + y) % subdomains.length];
}

/**
 * 计算 QuadKey
 */
export function computeQuadKey(z: number, x: number, y: number): string {
  let quadkey = '';
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit.toString();
  }
  return quadkey;
}

/**
 * 从 QuadKey 解析瓦片坐标
 */
export function parseQuadKey(quadkey: string): { z: number; x: number; y: number } {
  let z = quadkey.length;
  let x = 0;
  let y = 0;

  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    const digit = parseInt(quadkey[z - i], 10);

    if ((digit & 1) !== 0) x |= mask;
    if ((digit & 2) !== 0) y |= mask;
  }

  return { z, x, y };
}