/**
 * DOOR 赛事抽签流程测试数据生成器
 * 生成不少于 1000 人的测试名单 Excel 文件
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 常见中文姓氏
const SURNAMES = [
    '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
    '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
    '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏',
    '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章',
    '云', '苏', '潘', '葛', '奚', '范', '彭', '郎', '鲁', '韦',
    '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳',
    '酆', '鲍', '史', '唐', '费', '廉', '岑', '薛', '雷', '贺',
    '倪', '汤', '滕', '殷', '罗', '毕', '郝', '邬', '安', '常',
    '乐', '于', '时', '傅', '皮', '卞', '齐', '康', '伍', '余',
    '元', '卜', '顾', '孟', '平', '黄', '和', '穆', '萧', '尹'
];

// 常见中文名字
const GIVEN_NAMES = [
    '伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军',
    '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞',
    '平', '刚', '桂英', '华', '梅', '鑫', '玲', '飞', '桂兰', '英',
    '燕', '萍', '波', '芬', '建华', '建国', '建军', '建', '红', '志强',
    '浩', '宇', '欣', '鹏', '帅', '倩', '宇轩', '梓涵', '子轩', '浩然',
    '雨桐', '欣怡', '一诺', '子涵', '梓轩', '雨泽', '宇辰', '沐阳', '晨曦', '佳怡'
];

// 城市列表
const CITIES = [
    '北京市', '上海市', '广州市', '深圳市', '杭州市', '南京市', '成都市', '武汉市',
    '西安市', '重庆市', '天津市', '苏州市', '长沙市', '郑州市', '青岛市', '宁波市',
    '厦门市', '福州市', '合肥市', '南昌市', '昆明市', '贵阳市', '南宁市', '海口市'
];

// 生成随机整数
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 生成随机选择
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// 生成身份证号（简化版，符合基本格式）
function generateIdNumber(birthYear) {
    const provinceCodes = ['110', '310', '440', '330', '320', '510', '420', '610', '500', '120'];
    const provinceCode = randomChoice(provinceCodes);
    const year = birthYear || randomInt(1970, 2000);
    const month = String(randomInt(1, 12)).padStart(2, '0');
    const day = String(randomInt(1, 28)).padStart(2, '0');
    const sequence = String(randomInt(1, 999)).padStart(3, '0');
    const gender = randomInt(0, 1); // 0: female, 1: male
    const lastDigit = String(randomInt(0, 9));
    
    return `${provinceCode}${String(randomInt(1, 20)).padStart(2, '0')}${year}${month}${day}${sequence}${gender}${lastDigit}`;
}

// 生成手机号
function generatePhone() {
    const prefixes = ['138', '139', '135', '136', '137', '158', '159', '188', '130', '131', '132', '156', '186'];
    const prefix = randomChoice(prefixes);
    const suffix = String(randomInt(1000000, 9999999));
    return `${prefix}${suffix}`;
}

// 生成姓名
function generateName() {
    const surname = randomChoice(SURNAMES);
    const givenName = randomChoice(GIVEN_NAMES);
    const twoCharName = Math.random() > 0.5;
    if (twoCharName) {
        return surname + givenName;
    }
    return surname + givenName + randomChoice(GIVEN_NAMES);
}

// 生成性别
function generateGender(idNumber) {
    // 身份证倒数第二位表示性别，奇数为男，偶数为女
    const genderDigit = parseInt(idNumber.slice(-2, -1));
    return genderDigit % 2 === 1 ? 'M' : 'F';
}

// 生成出生日期
function generateBirthday(idNumber) {
    const year = idNumber.slice(6, 10);
    const month = idNumber.slice(10, 12);
    const day = idNumber.slice(12, 14);
    return `${year}-${month}-${day}`;
}

// 生成参赛项目
function generateEvent() {
    const events = ['全程马拉松', '半程马拉松', '健康跑', '家庭跑'];
    const weights = [0.4, 0.35, 0.15, 0.1]; // 权重
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < events.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) {
            return events[i];
        }
    }
    return events[0];
}

// 生成服装尺码
function generateSize(gender, event) {
    const maleSizes = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    const femaleSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    
    const sizes = gender === 'M' ? maleSizes : femaleSizes;
    const weights = [0.05, 0.15, 0.25, 0.25, 0.2, 0.1];
    
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < sizes.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) {
            return sizes[i];
        }
    }
    return sizes[2];
}

// 生成城市
function generateCity() {
    return randomChoice(CITIES);
}

// 生成紧急联系人
function generateEmergencyContact() {
    return `${randomChoice(SURNAMES)}${randomChoice(GIVEN_NAMES)}`;
}

// 生成紧急联系人电话
function generateEmergencyPhone() {
    return generatePhone();
}

// 生成测试数据
function generateTestData(count) {
    const data = [];
    
    for (let i = 0; i < count; i++) {
        const idNumber = generateIdNumber();
        const gender = generateGender(idNumber);
        const event = generateEvent();
        
        const record = {
            '姓名': generateName(),
            '身份证号': idNumber,
            '性别': gender,
            '出生日期': generateBirthday(idNumber),
            '手机号': generatePhone(),
            '参赛项目': event,
            '服装尺码': generateSize(gender, event),
            '城市': generateCity(),
            '紧急联系人': generateEmergencyContact(),
            '紧急联系人电话': generateEmergencyPhone(),
            '邮箱': `runner${i + 1}@example.com`,
            '证件类型': '身份证',
            '国籍': '中国',
            '民族': '汉',
        };
        
        data.push(record);
    }
    
    return data;
}

// 写入 Excel 文件
async function writeExcelFile(data, filePath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('报名名单');
    
    // 设置列
    const columns = Object.keys(data[0]);
    worksheet.columns = columns.map(col => ({
        header: col,
        key: col,
        width: 20
    }));
    
    // 设置表头样式
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // 添加数据
    data.forEach(record => {
        worksheet.addRow(record);
    });
    
    // 保存文件
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Excel 文件已生成：${filePath}`);
    console.log(`   总行数：${data.length}`);
}

// 主函数
async function main() {
    const count = process.argv[2] ? parseInt(process.argv[2]) : 1200;
    const outputFile = process.argv[3] || path.join(__dirname, 'fixtures', 'test-participants.xlsx');
    
    console.log('='.repeat(60));
    console.log('DOOR 赛事抽签测试数据生成器');
    console.log('='.repeat(60));
    console.log(`生成人数：${count}`);
    console.log(`输出文件：${outputFile}`);
    
    // 确保目录存在
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    console.log('\n正在生成测试数据...');
    const data = generateTestData(count);
    
    console.log('正在写入 Excel 文件...');
    await writeExcelFile(data, outputFile);
    
    console.log('\n✅ 测试数据生成完成！');
    
    // 打印统计信息
    const genderStats = data.reduce((acc, row) => {
        acc[row['性别']] = (acc[row['性别']] || 0) + 1;
        return acc;
    }, {});
    
    const eventStats = data.reduce((acc, row) => {
        acc[row['参赛项目']] = (acc[row['参赛项目']] || 0) + 1;
        return acc;
    }, {});
    
    console.log('\n性别分布:');
    console.log(`  男性：${genderStats['M'] || 0} 人`);
    console.log(`  女性：${genderStats['F'] || 0} 人`);
    
    console.log('\n项目分布:');
    Object.entries(eventStats).forEach(([event, count]) => {
        console.log(`  ${event}: ${count} 人`);
    });
}

main().catch(console.error);
