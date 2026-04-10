/**
 * 数据清洗与转换核心逻辑
 * 包含 5 个清洗功能 + 4 项校验修正
 *
 * 校验修正（在清洗前自动执行）：
 * 1. 拼音校正：已有拼音与姓名不匹配时自动修正
 * 2. 国家字段纠错：省名误填到国家栏时修正为中华人民共和国
 * 3. 身份证优先：身份证数据覆盖手填性别/年龄/生日
 * 4. 地址层级校验：省/市/区逻辑一致性 + 详细地址拆分
 */
import { normalizeCountry } from './countryNames';
import { parseAddress, matchProvinceName, isCityInProvince, isDistrictInCity, findProvinceByCity, matchCityName, matchDistrictName } from './chinaRegions';
import { getRegionByIdCode } from './idCardRegions';
import type { MergedRow, StandardField } from './importTypes';
import { nameToPinyin as sharedNameToPinyin, type NamePinyinOptions } from './namePinyin';

// ================================================================
// 1. 姓名全拼
// ================================================================

/**
 * 将中文姓名转为拼音全拼（大写无声调，姓与名之间空格分隔）
 * 例：张三 → ZHANG SAN
 */
export function nameToPinyin(name: string): string {
    return sharedNameToPinyin(name);
}

/**
 * 比较两个拼音是否等价（忽略大小写和空格）
 */
function pinyinEqual(a: string, b: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '');
    return normalize(a) === normalize(b);
}

// ================================================================
// 2. 国家/地区归一化（直接使用 countryNames 模块）
// ================================================================
export { normalizeCountry };

// ================================================================
// 3. 身份证号码信息提取
// ================================================================

/** 身份证校验码权重 */
const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK_CHARS = '10X98765432';

/**
 * 校验中国居民身份证号码 (18位或15位)
 */
export function isValidChineseId(id: string): boolean {
    // 15位：全数字
    if (/^\d{15}$/.test(id)) return true;
    // 18位：前17位数字，末位数字或X
    if (!/^\d{17}[\dXx]$/.test(id)) return false;

    // 18位进一步校验校验位
    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += parseInt(id[i]) * ID_WEIGHTS[i];
    }
    const checkChar = ID_CHECK_CHARS[sum % 11];
    return id[17].toUpperCase() === checkChar;
}

export interface IdCardInfo {
    gender: string;
    birthday: string;
    age: number;
}

/**
 * 从 18 位或 15 位中国居民身份证号提取信息
 * @param idNumber 身份证号
 * @param referenceDate 计算年龄的基准日期（默认为今天）
 */
export function parseChineseIdCard(idNumber: string, referenceDate: Date = new Date()): IdCardInfo | null {
    const id = idNumber.trim();
    if (!isValidChineseId(id)) return null;

    let birthYear: number;
    let birthMonth: number;
    let birthDay: number;
    let genderCode: number;

    if (id.length === 18) {
        birthYear = parseInt(id.substring(6, 10));
        birthMonth = parseInt(id.substring(10, 12));
        birthDay = parseInt(id.substring(12, 14));
        genderCode = parseInt(id[16]);
    } else {
        // 15位: 6位地区 + 2位年(19xx) + 2位月 + 2位日 + 3位顺序码
        birthYear = 1900 + parseInt(id.substring(6, 8));
        birthMonth = parseInt(id.substring(8, 10));
        birthDay = parseInt(id.substring(10, 12));
        genderCode = parseInt(id[14]);
    }

    // 验证日期合法性
    const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
    if (
        birthDate.getFullYear() !== birthYear ||
        birthDate.getMonth() !== birthMonth - 1 ||
        birthDate.getDate() !== birthDay
    ) {
        return null;
    }

    const gender = genderCode % 2 === 1 ? '男' : '女';
    const birthday = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

    // 计算年龄 (基于 referenceDate)
    let age = referenceDate.getFullYear() - birthYear;
    if (
        referenceDate.getMonth() < birthMonth - 1 ||
        (referenceDate.getMonth() === birthMonth - 1 && referenceDate.getDate() < birthDay)
    ) {
        age--;
    }

    return { gender, birthday, age };
}

// ================================================================
// 4. 衣服尺码归一化
// ================================================================

/** 尺码变体映射表 */
const SIZE_NORMALIZE_MAP: Record<string, string> = {
    'xxs': 'XXS',
    'xs': 'XS',
    's': 'S',
    'm': 'M',
    'l': 'L',
    'xl': 'XL',
    'xxl': '2XL',
    'xxxl': '3XL',
    'xxxxl': '4XL',
    'xxxxxl': '5XL',
    '2xl': '2XL',
    '3xl': '3XL',
    '4xl': '4XL',
    '5xl': '5XL',
    'xx': '2XL',
};


/**
 * 归一化衣服尺码
 * 规则：
 * 1. 优先匹配标准英文字母 (S, M, L...)
 * 2. 尝试解析 "175/96A" 格式，根据性别推断
 * 3. 尝试解析纯数字身高 (175)
 */
export function normalizeClothingSize(size: string): string {
    if (!size || !size.trim()) return '';

    // 1. 预处理：去除括号及内容，统一大写
    // M(170) -> M, 175/96A -> 175/96A
    const cleaned = size.trim().replace(/[（(][^)）]*[)）]/g, '').trim().toUpperCase();

    // 2. 直接映射 (S, M, L, XL...)
    const directMap = SIZE_NORMALIZE_MAP[cleaned.toLowerCase()];
    if (directMap) return directMap;

    // 3. 解析 "175/96A" 或 "175" 格式
    // 提取身高部分 (前3位数字)
    const heightMatch = cleaned.match(/^(\d{3})/);
    if (heightMatch) {
        const height = parseInt(heightMatch[1]);
        if (height >= 150 && height <= 210) {
            // 男女同码，统一标准
            return mapHeightToSize(height);
        }
    }

    // 4. 解析 "XS/160" 或 "160/XS" 组合格式
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        for (const part of parts) {
            const p = part.trim();
            // 尝试直接映射 (如 "XS")
            const mapped = SIZE_NORMALIZE_MAP[p.toLowerCase()];
            if (mapped) return mapped;

            // 尝试身高映射 (如 "160")
            const hMatch = p.match(/^(\d{3})/);
            if (hMatch) {
                const height = parseInt(hMatch[1]);
                if (height >= 150 && height <= 210) {
                    return mapHeightToSize(height);
                }
            }
        }
    }

    return cleaned;
}

/**
 * 根据身高估算尺码 (男女同码标准)
 * 155-XXS, 160-XS, 165-S, 170-M, 175-L, 180-XL, 185-2XL, 190-3XL, 195-4XL
 */
function mapHeightToSize(height: number): string {
    if (height < 158) return 'XXS'; // < 158 -> 155
    if (height < 163) return 'XS';  // 158-162 -> 160
    if (height < 168) return 'S';   // 163-167 -> 165
    if (height < 173) return 'M';   // 168-172 -> 170
    if (height < 178) return 'L';   // 173-177 -> 175
    if (height < 183) return 'XL';  // 178-182 -> 180
    if (height < 188) return '2XL'; // 183-187 -> 185
    if (height < 193) return '3XL'; // 188-192 -> 190
    return '4XL';                   // >= 193 -> 195+
}

// ================================================================
// 5. 地址解析（使用 chinaRegions 模块）
// ================================================================
export { parseAddress };

// ================================================================
// 统一清洗接口
// ================================================================

/** 清洗规则开关 */
export interface CleaningRules {
    pinyin: boolean;
    country: boolean;
    idCard: boolean;
    clothingSize: boolean;
    address: boolean;
    idCardAddress: boolean;
}

/** 清洗统计 */
export interface CleaningStats {
    pinyin: number;
    country: number;
    idCard: number;
    clothingSize: number;
    address: number;
    idCardAddress: number; // New stat
}

/** 默认全部开启 */
export const DEFAULT_CLEANING_RULES: CleaningRules = {
    pinyin: true,
    country: true,
    idCard: true,
    clothingSize: true,
    address: true,
    idCardAddress: true,
};

/** 中国相关国家名列表（用于判断是否为中国） */
const CHINA_COUNTRY_NAMES = ['中华人民共和国', '中国', '中国大陆', 'China', 'CN', 'CHN'];

/**
 * 对合并后的数据应用清洗规则
 * 包含：校验修正 + 数据清洗
 */
export function applyCleaningRules(
    data: MergedRow[],
    rules: CleaningRules,
    _standardFields: StandardField[],
    referenceDate: Date = new Date(),
    options: NamePinyinOptions = {}
): { cleanedData: MergedRow[]; stats: CleaningStats } {
    const stats: CleaningStats = { pinyin: 0, country: 0, idCard: 0, clothingSize: 0, address: 0, idCardAddress: 0 };

    const cleanedData = data.map(row => {
        const newRow = { ...row };

        // ============================================================
        // 第一阶段：校验与修正（在清洗前自动执行）
        // ============================================================

        // --- 修正 1：拼音校正 + 格式统一 ---
        if (rules.pinyin && newRow['name']) {
            const correctPinyin = sharedNameToPinyin(newRow['name'], options);
            if (correctPinyin) {
                if (!newRow['namePinyin']) {
                    // 空值：直接填充
                    newRow['namePinyin'] = correctPinyin;
                    stats.pinyin++;
                } else if (!pinyinEqual(newRow['namePinyin'], correctPinyin)) {
                    // 已有值但不匹配：自动修正
                    newRow['namePinyin'] = correctPinyin;
                    stats.pinyin++;
                } else if (newRow['namePinyin'] !== correctPinyin) {
                    // 内容匹配但格式不同（如 liukuan → LIU KUAN）：统一格式
                    newRow['namePinyin'] = correctPinyin;
                    stats.pinyin++;
                }
            }
        }

        // --- 修正 2：国家字段纠错 ---
        if (rules.country && newRow['country']) {
            const countryVal = newRow['country'].trim();
            // 检查是否把省名误填到了国家字段
            const matchedProvince = matchProvinceName(countryVal);
            if (matchedProvince) {
                // 将省名移到 province 字段，国家设为中华人民共和国
                if (!newRow['province']) {
                    newRow['province'] = matchedProvince;
                }
                newRow['country'] = '中华人民共和国';
                stats.country++;
            } else {
                // 正常的国家归一化
                const normalized = normalizeCountry(countryVal);
                if (normalized !== countryVal) {
                    newRow['country'] = normalized;
                    stats.country++;
                }
            }
        }

        // --- 修正 3：身份证数据强制覆盖手填数据 ---
        if (rules.idCard && newRow['idNumber']) {
            const info = parseChineseIdCard(newRow['idNumber'], referenceDate);
            if (info) {
                let changed = false;
                // 身份证数据始终优先覆盖手填数据
                if (newRow['gender'] !== info.gender) {
                    newRow['gender'] = info.gender;
                    changed = true;
                }
                if (newRow['birthday'] !== info.birthday) {
                    newRow['birthday'] = info.birthday;
                    changed = true;
                }
                // 年龄始终用最新计算值
                const newAge = String(info.age);
                if (newRow['age'] !== newAge) {
                    newRow['age'] = newAge;
                    changed = true;
                }

                if (changed) stats.idCard++;
            }
        }

        // ============================================================
        // 第二阶段：数据清洗
        // ============================================================

        // 4. 衣服尺码归一化
        if (rules.clothingSize && newRow['clothingSize']) {
            // Updated to use unisex standard (no gender needed)
            const normalized = normalizeClothingSize(newRow['clothingSize']);
            if (normalized !== newRow['clothingSize']) {
                newRow['clothingSize'] = normalized;
                stats.clothingSize++;
            }
        }

        // 5. 地址解析与层级校验（4 条联动规则）
        if (rules.address) {
            let addressChanged = false;
            let prov = (newRow['province'] || '').trim();
            let city = (newRow['city'] || '').trim();
            let dist = (newRow['district'] || '').trim();

            // --- 规则 3：信息全填到一个字段里了（如 "重庆市/ 重庆市/ 合川区" 或 "四川省成都市锦江区"） ---
            // 检测省字段是否包含了市/区信息
            if (prov && (prov.includes('/') || prov.includes('\\') || prov.includes(',') || prov.includes('，')
                || (matchProvinceName(prov) === null && parseAddress(prov).province))) {
                const parsed = parseAddress(prov);
                if (parsed.province) {
                    prov = parsed.province;
                    if (parsed.city) city = parsed.city;
                    if (parsed.district) dist = parsed.district;
                    addressChanged = true;
                }
            }
            // 检测市字段里是否有完整地址
            if (city && (city.includes('/') || city.includes('\\') || city.includes(',') || city.includes('，'))) {
                const parsed = parseAddress(city);
                if (parsed.province) {
                    if (!prov) prov = parsed.province;
                    city = parsed.city;
                    if (parsed.district && !dist) dist = parsed.district;
                    addressChanged = true;
                }
            }

            // 标准化省名（简称→全称）
            if (prov) {
                const stdProv = matchProvinceName(prov);
                if (stdProv && stdProv !== prov) {
                    prov = stdProv;
                    addressChanged = true;
                }
            }

            // 标准化市名（如 "成都" → "成都市"）
            if (city) {
                const stdCity = matchCityName(city, prov || undefined);
                if (stdCity && stdCity !== city) {
                    city = stdCity;
                    addressChanged = true;
                }
            }

            // 标准化区名（如 "锦江" → "锦江区"）
            if (dist) {
                const stdDist = matchDistrictName(dist, prov || undefined, city || undefined);
                if (stdDist && stdDist !== dist) {
                    dist = stdDist;
                    addressChanged = true;
                }
            }

            // --- 规则 1 & 2：校验省/市/区逻辑一致性 ---
            if (prov && city) {
                const stdProv = matchProvinceName(prov) || prov;
                if (!isCityInProvince(stdProv, city)) {
                    // 市不属于该省 → 逻辑错误
                    // 尝试用市反查正确的省
                    const correctProv = findProvinceByCity(city);
                    if (correctProv) {
                        prov = correctProv;
                        addressChanged = true;
                    } else {
                        // 市本身也无法匹配 → 尝试从详细地址修复
                        const fromAddr = newRow['address'] ? parseAddress(newRow['address']) : null;
                        if (fromAddr && fromAddr.province) {
                            prov = fromAddr.province;
                            city = fromAddr.city || '';
                            dist = fromAddr.district || '';
                        } else {
                            // 无法修复 → 留空
                            prov = '';
                            city = '';
                            dist = '';
                        }
                        addressChanged = true;
                    }
                }
            }

            // 区不属于市 → 清空区
            if (prov && city && dist) {
                if (!isDistrictInCity(prov, city, dist)) {
                    // 尝试从详细地址修复
                    const fromAddr = newRow['address'] ? parseAddress(newRow['address']) : null;
                    if (fromAddr && fromAddr.district) {
                        dist = fromAddr.district;
                    } else {
                        dist = '';
                    }
                    addressChanged = true;
                }
            }

            // --- 规则 4：有空字段 → 先尝试从详细地址中提取补全 ---
            if ((!prov || !city || !dist) && newRow['address']) {
                const parsed = parseAddress(newRow['address']);
                if (parsed.province) {
                    if (!prov) { prov = parsed.province; addressChanged = true; }
                    if (!city && parsed.city) { city = parsed.city; addressChanged = true; }
                    if (!dist && parsed.district) { dist = parsed.district; addressChanged = true; }
                }
            }

            // 直辖市特殊处理
            const directCities = ['北京市', '天津市', '上海市', '重庆市'];
            if (directCities.includes(prov)) {
                if (city === prov || !city) {
                    city = '';
                }
            }

            // 国家修正：有中国省份 → 国家应为中国
            if (prov && matchProvinceName(prov)) {
                const country = (newRow['country'] || '').trim();
                if (!country) {
                    newRow['country'] = '中华人民共和国';
                } else if (!CHINA_COUNTRY_NAMES.some(n => n === country) && country !== '中华人民共和国') {
                    newRow['country'] = '中华人民共和国';
                    addressChanged = true;
                }
            }

            // 写回
            if (prov !== (newRow['province'] || '').trim() || city !== (newRow['city'] || '').trim() || dist !== (newRow['district'] || '').trim()) {
                addressChanged = true;
            }
            newRow['province'] = prov;
            newRow['city'] = city;
            newRow['district'] = dist;

            if (addressChanged) stats.address++;
        }

        // --- 规则 5：地址提取后仍有空字段 → 回退到身份证提取（兜底） ---
        if (rules.idCardAddress && newRow['idNumber'] && (!newRow['province'] || !newRow['city'] || !newRow['district'])) {
            const idNum = newRow['idNumber'].trim();
            const region = getRegionByIdCode(idNum);

            if (region) {
                let modified = false;
                if (!newRow['province'] && region.province) { newRow['province'] = region.province; modified = true; }
                if (!newRow['city'] && region.city) { newRow['city'] = region.city; modified = true; }
                if (!newRow['district'] && region.district) { newRow['district'] = region.district; modified = true; }

                if (modified) stats.idCardAddress++;
            } else {
                if (idNum.length > 0 && !newRow['province']) {
                    newRow['province'] = '境外';
                    stats.idCardAddress++;
                }
            }
        }

        return newRow;
    });

    return { cleanedData, stats };
}
