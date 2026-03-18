/**
 * 动态数据脱敏工具
 * ==================
 *
 * 根据用户权限对敏感字段进行掩码处理
 * 支持手机号、身份证号、邮箱等 PII 字段
 */

// ============================================================================
// 掩码规则
// ============================================================================

/**
 * 手机号掩码
 * 13812345678 → 138****5678
 *
 * @param {string} phone - 原始手机号
 * @returns {string} 掩码后的手机号
 */
export function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;

    // 中国手机号：保留前3后4
    if (/^\d{11}$/.test(phone)) {
        return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
    }

    // 国际号码：保留前3后3，中间用 **** 替代
    if (phone.length > 6) {
        return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
    }

    // 短号码：全部掩码
    return '******';
}

/**
 * 身份证号掩码
 * 310105199001011234 → 310105********1234
 *
 * @param {string} idNumber - 原始身份证号
 * @returns {string} 掩码后的身份证号
 */
export function maskIdNumber(idNumber) {
    if (!idNumber || typeof idNumber !== 'string') return idNumber;

    // 中国身份证号：保留前6后4
    if (/^\d{17}[\dXx]$/.test(idNumber)) {
        return `${idNumber.slice(0, 6)}********${idNumber.slice(-4)}`;
    }

    // 其他格式：保留前3后3
    if (idNumber.length > 6) {
        return `${idNumber.slice(0, 3)}****${idNumber.slice(-3)}`;
    }

    return '******';
}

/**
 * 邮箱掩码
 * example@domain.com → exa***@domain.com
 *
 * @param {string} email - 原始邮箱
 * @returns {string} 掩码后的邮箱
 */
export function maskEmail(email) {
    if (!email || typeof email !== 'string') return email;

    const atIdx = email.indexOf('@');
    if (atIdx <= 0) return email;

    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx);

    // 保留前3字符，其余用 *** 替代
    const visiblePart = local.slice(0, Math.min(3, local.length));
    return `${visiblePart}***${domain}`;
}

/**
 * 姓名掩码
 * 张三 → 张*
 * 李四光 → 李**
 * 欧阳修 → 欧**
 *
 * @param {string} name - 原始姓名
 * @returns {string} 掩码后的姓名
 */
export function maskName(name) {
    if (!name || typeof name !== 'string') return name;

    if (name.length === 1) return '*';
    if (name.length === 2) return `${name[0]}*`;
    return `${name[0]}${'*'.repeat(name.length - 1)}`;
}

// ============================================================================
// 记录级脱敏
// ============================================================================

/**
 * 对记录对象进行脱敏
 *
 * @param {object} record - 原始记录
 * @param {object} options - 脱敏选项
 * @param {string[]} options.fields - 需要脱敏的字段列表
 * @returns {object} 脱敏后的记录
 */
export function maskRecord(record, options = {}) {
    if (!record) return record;

    const fields = options.fields || ['phone', 'emergency_phone', 'id_number'];
    const masked = { ...record };

    for (const field of fields) {
        if (masked[field] == null) continue;

        switch (field) {
            case 'phone':
            case 'emergency_phone':
                masked[field] = maskPhone(masked[field]);
                break;
            case 'id_number':
                masked[field] = maskIdNumber(masked[field]);
                break;
            case 'email':
                masked[field] = maskEmail(masked[field]);
                break;
            case 'emergency_name':
                masked[field] = maskName(masked[field]);
                break;
            default:
                // 未知字段，用通用掩码
                masked[field] = '******';
        }
    }

    return masked;
}

/**
 * 对抽签名单条目进行脱敏
 *
 * @param {object} entry - 抽签名单条目
 * @param {object} options - 脱敏选项
 * @returns {object} 脱敏后的条目
 */
export function maskLotteryList(entry, options = {}) {
    if (!entry) return entry;

    const fields = options.fields || ['phone', 'id_number'];
    const masked = { ...entry };

    for (const field of fields) {
        if (masked[field] == null) continue;

        switch (field) {
            case 'phone':
                masked[field] = maskPhone(masked[field]);
                break;
            case 'id_number':
                masked[field] = maskIdNumber(masked[field]);
                break;
        }
    }

    return masked;
}

/**
 * 批量脱敏记录数组
 *
 * @param {object[]} records - 记录数组
 * @param {object} options - 脱敏选项
 * @returns {object[]} 脱敏后的记录数组
 */
export function maskRecords(records, options = {}) {
    if (!Array.isArray(records)) return records;
    return records.map(record => maskRecord(record, options));
}

/**
 * 批量脱敏抽签名单数组
 *
 * @param {object[]} entries - 条目数组
 * @param {object} options - 脱敏选项
 * @returns {object[]} 脱敏后的条目数组
 */
export function maskLotteryLists(entries, options = {}) {
    if (!Array.isArray(entries)) return entries;
    return entries.map(entry => maskLotteryList(entry, options));
}

// ============================================================================
// 导出数据脱敏
// ============================================================================

/**
 * 对导出数据进行脱敏
 * 用于 CSV/Excel 导出场景
 *
 * @param {object} record - 原始记录
 * @param {object} options - 脱敏选项
 * @param {boolean} options.includePhone - 是否包含手机号
 * @param {boolean} options.includeIdNumber - 是否包含身份证号
 * @returns {object} 脱敏后的记录
 */
export function maskExportRecord(record, options = {}) {
    if (!record) return record;

    const masked = { ...record };

    // 默认导出时全部脱敏
    if (options.includePhone !== true) {
        if (masked.phone) masked.phone = maskPhone(masked.phone);
        if (masked.emergency_phone) masked.emergency_phone = maskPhone(masked.emergency_phone);
    }

    if (options.includeIdNumber !== true) {
        if (masked.id_number) masked.id_number = maskIdNumber(masked.id_number);
    }

    return masked;
}

/**
 * 批量脱敏导出数据
 *
 * @param {object[]} records - 记录数组
 * @param {object} options - 脱敏选项
 * @returns {object[]} 脱敏后的记录数组
 */
export function maskExportRecords(records, options = {}) {
    if (!Array.isArray(records)) return records;
    return records.map(record => maskExportRecord(record, options));
}