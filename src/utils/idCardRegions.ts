/**
 * GB2260 行政区划代码映射表
 * 数据源：
 *   1. gb2260 npm 库 (201607 + 200212) - 提供结构化的层级查询
 *   2. 本地合并数据 gb2260_all.json (1980-2018 全部39个版本超集, 5607个代码)
 *   3. 自定义映射 (最终兜底)
 * 
 * 覆盖 1980~2018 年间所有曾经使用过的行政区划代码
 */
import gb2260 from 'gb2260';
import type { Division } from 'gb2260';
import data2016 from 'gb2260/lib/201607.json';
import data2002 from 'gb2260/lib/200212.json';
import allHistoricalData from '../data/gb2260_all.json';

// 初始化 gb2260 库 (结构化查询)
gb2260.register('201607', data2016);
gb2260.register('200212', data2002);

const gb2016 = new gb2260.GB2260('201607');
const gb2002 = new gb2260.GB2260('200212');

// 历史超集数据 (扁平 { code: name } 映射)
const allDataMap = allHistoricalData as Record<string, string>;

const DIRECT_CITIES = ['北京市', '天津市', '上海市', '重庆市'];

/**
 * 自定义映射（最终兜底，用于所有数据源都缺失的特殊代码）
 */
const CUSTOM_MAP: Record<string, { province: string; city: string; district: string }> = {
    // 如遇到新的无法匹配的代码，可在此增补
};

// ================================================================
// 格式化函数
// ================================================================

/**
 * 格式化 gb2260 库返回的 Division 对象 → { province, city, district }
 */
function formatDivision(info: Division | null): { province: string; city: string; district: string } | null {
    if (!info) return null;

    let province = '';
    let city = '';
    let district = '';

    if (!info.province) {
        province = info.name;
    } else if (!info.prefecture) {
        province = info.province.name;
        city = info.name;
    } else {
        province = info.province.name;
        city = info.prefecture.name;
        district = info.name;
    }

    if (DIRECT_CITIES.includes(province)) {
        city = province;
        if (district === '市辖区' || district === '县') {
            district = '';
        }
    }

    return { province, city, district };
}

/**
 * 从扁平 {code: name} 映射中手动提取省/市/区
 * 利用 GB2260 编码规则：前2位=省，前4位+00=市，6位=区县
 */
function lookupFromFlatMap(
    map: Record<string, string>,
    code: string
): { province: string; city: string; district: string } | null {
    const name = map[code];
    if (!name) return null;

    const provCode = code.substring(0, 2) + '0000';
    const cityCode = code.substring(0, 4) + '00';

    let province = map[provCode] || '';
    let city = '';
    let district = '';

    if (code === provCode) {
        province = name;
    } else if (code === cityCode) {
        city = name;
    } else {
        city = map[cityCode] || '';
        district = name;
    }

    if (DIRECT_CITIES.includes(province)) {
        city = province;
        if (district === '市辖区' || district === '县') {
            district = '';
        }
    }

    return { province, city, district };
}

// ================================================================
// 主查找函数
// ================================================================

/**
 * 根据身份证号或6位行政区划代码获取对应省市区
 * 
 * 查找顺序（每级都按 精确→地市→省级 逐层回退）：
 * 1. gb2260 2016版 (结构化，最新)
 * 2. gb2260 2002版 (结构化，历史)
 * 3. 本地合并数据 (1980-2018全部版本超集)
 * 4. 自定义映射 (兜底)
 */
export function getRegionByIdCode(codeString: string): { province: string; city: string; district: string } | null {
    if (!codeString || codeString.length < 6) return null;
    const code = codeString.substring(0, 6);

    // 构建层级查找序列：精确 → 地市级 → 省级
    const codesToTry = [code];
    if (!code.endsWith('00')) {
        codesToTry.push(code.substring(0, 4) + '00');
    }
    if (!code.endsWith('0000')) {
        codesToTry.push(code.substring(0, 2) + '0000');
    }

    for (const tryCode of codesToTry) {
        // 1. 最新版本 (2016) - 结构化查询
        try {
            const info = gb2016.get(tryCode);
            if (info) return formatDivision(info);
        } catch { /* ignore */ }

        // 2. 老版本 (2002) - 结构化查询
        try {
            const info = gb2002.get(tryCode);
            if (info) return formatDivision(info);
        } catch { /* ignore */ }

        // 3. 历史超集 (1980-2018) - 扁平映射
        const histInfo = lookupFromFlatMap(allDataMap, tryCode);
        if (histInfo) return histInfo;

        // 4. 自定义映射（兜底）
        if (CUSTOM_MAP[tryCode]) {
            return { ...CUSTOM_MAP[tryCode] };
        }
    }

    return null;
}
