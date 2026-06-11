/**
 * ArcSpro 赛事名单导入系统测试数据生成器
 * 生成不少于 2000 人的测试名单 Excel 文件
 * 覆盖所有测试项目：基本信息、参赛项目、服装尺码、成绩数据、紧急联系人等
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 数据字典 ====================

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
    '元', '卜', '顾', '孟', '平', '黄', '和', '穆', '萧', '尹',
    '姚', '邵', '湛', '汪', '祁', '毛', '禹', '狄', '米', '贝',
    '明', '臧', '计', '伏', '成', '戴', '谈', '宋', '茅', '庞',
    '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜', '阮'
];

// 常见中文名字（男性）
const MALE_NAMES = [
    '伟', '强', '磊', '军', '洋', '勇', '杰', '涛', '明', '超',
    '建华', '建国', '建军', '志强', '浩', '宇', '鹏', '帅', '宇轩',
    '子轩', '浩然', '雨泽', '宇辰', '沐阳', '晨曦', '俊杰', '文博',
    '天佑', '皓轩', '擎苍', '致远', '晟睿', '楷瑞', '天翊', '凯瑞',
    '子骞', '峻熙', '嘉懿', '煜城', '懿轩', '烨伟', '苑博', '伟泽',
    '熠彤', '鸿煊', '博涛', '烨霖', '烨华', '煜祺', '智宸', '正豪'
];

// 常见中文名字（女性）
const FEMALE_NAMES = [
    '芳', '娜', '秀英', '敏', '静', '丽', '艳', '娟', '霞', '平',
    '秀兰', '桂英', '华', '梅', '玲', '飞', '桂兰', '英', '燕',
    '萍', '波', '芬', '红', '倩', '欣怡', '雨桐', '一诺', '子涵',
    '梓涵', '佳怡', '诗涵', '梦琪', '雅婷', '雨萱', '思涵', '语嫣',
    '梦瑶', '若曦', '紫萱', '诗琪', '雅琳', '瑾萱', '钰彤', '雪芬',
    '芸熙', '妙菱', '雪雁', '煜婷', '笑怡', '优璇', '雨嘉', '明美'
];

// 城市列表（带省市区信息）
const CITY_DATA = [
    { province: '北京市', city: '北京市', district: '朝阳区' },
    { province: '北京市', city: '北京市', district: '海淀区' },
    { province: '北京市', city: '北京市', district: '西城区' },
    { province: '上海市', city: '上海市', district: '浦东新区' },
    { province: '上海市', city: '上海市', district: '徐汇区' },
    { province: '上海市', city: '上海市', district: '黄浦区' },
    { province: '广东省', city: '广州市', district: '天河区' },
    { province: '广东省', city: '广州市', district: '越秀区' },
    { province: '广东省', city: '深圳市', district: '南山区' },
    { province: '广东省', city: '深圳市', district: '福田区' },
    { province: '浙江省', city: '杭州市', district: '西湖区' },
    { province: '浙江省', city: '杭州市', district: '滨江区' },
    { province: '浙江省', city: '宁波市', district: '鄞州区' },
    { province: '江苏省', city: '南京市', district: '鼓楼区' },
    { province: '江苏省', city: '南京市', district: '建邺区' },
    { province: '江苏省', city: '苏州市', district: '工业园区' },
    { province: '四川省', city: '成都市', district: '锦江区' },
    { province: '四川省', city: '成都市', district: '武侯区' },
    { province: '湖北省', city: '武汉市', district: '江汉区' },
    { province: '湖北省', city: '武汉市', district: '武昌区' },
    { province: '陕西省', city: '西安市', district: '雁塔区' },
    { province: '陕西省', city: '西安市', district: '未央区' },
    { province: '重庆市', city: '重庆市', district: '渝中区' },
    { province: '重庆市', city: '重庆市', district: '江北区' },
    { province: '天津市', city: '天津市', district: '和平区' },
    { province: '天津市', city: '天津市', district: '南开区' },
    { province: '湖南省', city: '长沙市', district: '芙蓉区' },
    { province: '湖南省', city: '长沙市', district: '岳麓区' },
    { province: '河南省', city: '郑州市', district: '金水区' },
    { province: '河南省', city: '郑州市', district: '二七区' },
    { province: '山东省', city: '青岛市', district: '市南区' },
    { province: '山东省', city: '青岛市', district: '市北区' },
    { province: '福建省', city: '厦门市', district: '思明区' },
    { province: '福建省', city: '福州市', district: '鼓楼区' },
    { province: '安徽省', city: '合肥市', district: '蜀山区' },
    { province: '江西省', city: '南昌市', district: '东湖区' },
    { province: '云南省', city: '昆明市', district: '五华区' },
    { province: '贵州省', city: '贵阳市', district: '云岩区' },
    { province: '广西壮族自治区', city: '南宁市', district: '青秀区' },
    { province: '海南省', city: '海口市', district: '龙华区' }
];

// 民族列表
const ETHNICITIES = [
    '汉族', '壮族', '满族', '回族', '苗族', '维吾尔族', '土家族', '彝族', '蒙古族', '藏族',
    '布依族', '侗族', '瑶族', '朝鲜族', '白族', '哈尼族', '哈萨克族', '黎族', '傣族', '畲族'
];

// 血型
const BLOOD_TYPES = ['A', 'B', 'O', 'AB', '未知'];

// 证件类型
const ID_TYPES = ['身份证', '护照', '港澳通行证', '台胞证', '军官证'];

// 国籍
const COUNTRIES = ['中国', '中国', '中国', '中国', '中国', '中国香港', '中国澳门', '中国台湾', '美国', '英国', '日本', '韩国', '新加坡', '澳大利亚'];

// 参赛项目
const EVENTS = ['全程马拉松', '半程马拉松', '健康跑', '家庭跑'];
const EVENT_WEIGHTS = [0.4, 0.35, 0.15, 0.1];

// 服装尺码（男）
const MALE_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const MALE_SIZE_WEIGHTS = [0.05, 0.15, 0.3, 0.25, 0.15, 0.1];

// 服装尺码（女）
const FEMALE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const FEMALE_SIZE_WEIGHTS = [0.05, 0.2, 0.35, 0.25, 0.1, 0.05];

// ==================== 工具函数 ====================

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(items, weights) {
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) {
            return items[i];
        }
    }
    return items[items.length - 1];
}

// 生成身份证号（符合18位规则）
function generateIdNumber(birthYearRange = [1970, 2000]) {
    // 行政区划代码（部分主要城市）
    const provinceCodes = [
        '110101', '310101', '440106', '440305', '330106', '330108', '320106', '320105',
        '510104', '510107', '420103', '420106', '610113', '610112', '500103', '500105',
        '120101', '120104', '430102', '430104', '410105', '410103', '370202', '370203',
        '350203', '350102', '340104', '360102', '530102', '520103', '450103', '460106'
    ];

    const provinceCode = randomChoice(provinceCodes);
    const year = randomInt(birthYearRange[0], birthYearRange[1]);
    const month = String(randomInt(1, 12)).padStart(2, '0');
    const day = String(randomInt(1, 28)).padStart(2, '0');
    const sequence = String(randomInt(1, 999)).padStart(3, '0');

    const id17 = `${provinceCode}${year}${month}${day}${sequence}`;

    // 计算校验码
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += parseInt(id17[i]) * weights[i];
    }

    const checkCode = checkCodes[sum % 11];
    return id17 + checkCode;
}

// 生成护照号
function generatePassport() {
    const prefix = randomChoice(['E', 'G', 'P']);
    const number = String(randomInt(10000000, 99999999));
    return prefix + number;
}

// 生成手机号
function generatePhone() {
    const prefixes = ['138', '139', '135', '136', '137', '158', '159', '188', '130', '131', '132', '156', '186', '133', '153', '180', '181', '189'];
    const prefix = randomChoice(prefixes);
    const suffix = String(randomInt(10000000, 9999999)).padStart(7, '0');
    return prefix + suffix;
}

// 生成姓名
function generateName(gender) {
    const surname = randomChoice(SURNAMES);
    const isDoubleName = Math.random() > 0.3;

    if (gender === 'M') {
        const givenName = randomChoice(MALE_NAMES);
        if (isDoubleName && givenName.length === 1) {
            return surname + givenName + randomChoice(MALE_NAMES);
        }
        return surname + givenName;
    } else {
        const givenName = randomChoice(FEMALE_NAMES);
        if (isDoubleName && givenName.length === 1) {
            return surname + givenName + randomChoice(FEMALE_NAMES);
        }
        return surname + givenName;
    }
}

// 从身份证号获取性别
function getGenderFromId(idNumber) {
    if (idNumber.length === 18) {
        const genderDigit = parseInt(idNumber.slice(-2, -1));
        return genderDigit % 2 === 1 ? 'M' : 'F';
    }
    return Math.random() > 0.5 ? 'M' : 'F';
}

// 从身份证号获取出生日期
function getBirthdayFromId(idNumber) {
    if (idNumber.length === 18) {
        const year = idNumber.slice(6, 10);
        const month = idNumber.slice(10, 12);
        const day = idNumber.slice(12, 14);
        return `${year}-${month}-${day}`;
    }
    const year = randomInt(1970, 2000);
    const month = String(randomInt(1, 12)).padStart(2, '0');
    const day = String(randomInt(1, 28)).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 生成年龄
function generateAge(birthday) {
    const birthYear = parseInt(birthday.split('-')[0]);
    return 2026 - birthYear;
}

// 生成参赛项目
function generateEvent() {
    return weightedChoice(EVENTS, EVENT_WEIGHTS);
}

// 生成服装尺码
function generateSize(gender) {
    const sizes = gender === 'M' ? MALE_SIZES : FEMALE_SIZES;
    const weights = gender === 'M' ? MALE_SIZE_WEIGHTS : FEMALE_SIZE_WEIGHTS;
    return weightedChoice(sizes, weights);
}

// 生成城市信息
function generateCityInfo() {
    return randomChoice(CITY_DATA);
}

// 生成详细地址
function generateAddress(cityInfo) {
    const streetNames = ['建设大道', '解放路', '中山路', '人民路', '南京路', '北京路', '延安路', '和平街', '光明街', '新华路'];
    const communities = ['阳光花园', '锦绣家园', '金色年华', '翡翠城', '御景湾', '香榭丽舍', '碧桂园', '万科城', '恒大绿洲', '保利花园'];
    const street = randomChoice(streetNames);
    const community = randomChoice(communities);
    const building = randomInt(1, 20);
    const unit = randomInt(1, 4);
    const room = randomInt(101, 2000);
    return `${cityInfo.district}${street}${community}${building}栋${unit}单元${room}室`;
}

// 生成紧急联系人
function generateEmergencyContact() {
    const surname = randomChoice(SURNAMES);
    const givenName = randomChoice([...MALE_NAMES, ...FEMALE_NAMES]);
    return surname + givenName;
}

// 生成邮箱
function generateEmail(index) {
    const domains = ['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com', 'sina.com', 'sohu.com'];
    const prefix = `runner${String(index).padStart(5, '0')}`;
    return `${prefix}@${randomChoice(domains)}`;
}

// 生成成绩时间（格式：HH:MM:SS）
function generateFinishTime(event) {
    if (event === '全程马拉松') {
        // 全马：2:30:00 到 6:00:00
        const totalSeconds = randomInt(9000, 21600);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else if (event === '半程马拉松') {
        // 半马：1:15:00 到 3:00:00
        const totalSeconds = randomInt(4500, 10800);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return '';
}

// 生成个人最好成绩记录
function generatePersonalBest(event) {
    if (event === '全程马拉松') {
        const hasRecord = Math.random() > 0.3; // 70% 有全马成绩
        if (hasRecord) {
            return {
                raceName: randomChoice(['北京马拉松', '上海马拉松', '广州马拉松', '厦门马拉松', '成都马拉松', '无锡马拉松']),
                netTime: generateFinishTime('全程马拉松')
            };
        }
    } else if (event === '半程马拉松') {
        const hasRecord = Math.random() > 0.2; // 80% 有半马成绩
        if (hasRecord) {
            return {
                raceName: randomChoice(['北京半程马拉松', '上海半程马拉松', '深圳南山半程马拉松', '成都双遗马拉松']),
                netTime: generateFinishTime('半程马拉松')
            };
        }
    }
    return null;
}

// ==================== 主函数 ====================

function generateTestData(count) {
    const data = [];
    const usedIdNumbers = new Set(); // 用于去重

    for (let i = 0; i < count; i++) {
        // 生成唯一身份证号
        let idNumber;
        let attempts = 0;
        do {
            // 根据年龄分布调整出生年份范围
            // 20-30岁占30%，30-40岁占35%，40-50岁占25%，50岁以上占10%
            const ageRand = Math.random();
            let birthRange;
            if (ageRand < 0.3) {
                birthRange = [1996, 2006]; // 20-30岁
            } else if (ageRand < 0.65) {
                birthRange = [1986, 1996]; // 30-40岁
            } else if (ageRand < 0.9) {
                birthRange = [1976, 1986]; // 40-50岁
            } else {
                birthRange = [1960, 1976]; // 50岁以上
            }

            idNumber = generateIdNumber(birthRange);
            attempts++;
        } while (usedIdNumbers.has(idNumber) && attempts < 100);

        usedIdNumbers.add(idNumber);

        // 根据身份证号确定性别
        const gender = getGenderFromId(idNumber);
        const birthday = getBirthdayFromId(idNumber);
        const age = generateAge(birthday);
        const event = generateEvent();
        const cityInfo = generateCityInfo();

        // 确定证件类型（90%身份证，10%其他）
        const idType = Math.random() > 0.9 ? randomChoice(ID_TYPES.slice(1)) : '身份证';
        const actualIdNumber = idType === '身份证' ? idNumber : generatePassport();

        // 生成个人最好成绩
        const pbFull = generatePersonalBest('全程马拉松');
        const pbHalf = generatePersonalBest('半程马拉松');

        const record = {
            // 基本信息
            '姓名': generateName(gender),
            '姓名拼音': '', // 系统会自动生成
            '身份证号': actualIdNumber,
            '证件类型': idType,
            '性别': gender === 'M' ? '男' : '女',
            '出生日期': birthday,
            '年龄': age,
            '手机号': generatePhone(),
            '邮箱': generateEmail(i + 1),
            '国籍': randomChoice(COUNTRIES),
            '民族': randomChoice(ETHNICITIES),

            // 参赛信息
            '参赛项目': event,
            '报名来源': randomChoice(['官网', '小程序', 'App', '第三方平台', '团体报名']),

            // 服装信息
            '服装尺码': generateSize(gender),

            // 地址信息
            '省份': cityInfo.province,
            '城市': cityInfo.city,
            '区县': cityInfo.district,
            '详细地址': generateAddress(cityInfo),

            // 紧急联系人
            '紧急联系人姓名': generateEmergencyContact(),
            '紧急联系人电话': generatePhone(),
            '血型': randomChoice(BLOOD_TYPES),

            // 成绩信息（用于抽签筛选）
            '全程马拉松最好成绩': pbFull ? pbFull.netTime : '',
            '全程马拉松成绩赛事': pbFull ? pbFull.raceName : '',
            '半程马拉松最好成绩': pbHalf ? pbHalf.netTime : '',
            '半程马拉松成绩赛事': pbHalf ? pbHalf.raceName : '',

            // 订单/支付信息
            '订单状态': '未支付',
            '备注': ''
        };

        data.push(record);
    }

    return data;
}

async function writeExcelFile(data, filePath) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('报名名单');

    // 设置列
    const columns = Object.keys(data[0]);
    worksheet.columns = columns.map(col => ({
        header: col,
        key: col,
        width: Math.max(col.length * 2 + 2, 15)
    }));

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    // 添加数据
    data.forEach((record, index) => {
        const row = worksheet.addRow(record);

        // 设置数据行样式
        row.alignment = { vertical: 'middle', horizontal: 'left' };

        // 隔行变色
        if (index % 2 === 1) {
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
            };
        }
    });

    // 冻结首行
    worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];

    // 添加自动筛选
    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length }
    };

    // 保存文件
    await workbook.xlsx.writeFile(filePath);
    console.log(`✅ Excel 文件已生成：${filePath}`);
    console.log(`   总行数：${data.length}`);
    console.log(`   总列数：${columns.length}`);
}

// 生成统计报告
function generateReport(data) {
    console.log('\n' + '='.repeat(70));
    console.log('测试数据统计报告');
    console.log('='.repeat(70));

    // 性别分布
    const genderStats = data.reduce((acc, row) => {
        acc[row['性别']] = (acc[row['性别']] || 0) + 1;
        return acc;
    }, {});

    console.log('\n📊 性别分布:');
    Object.entries(genderStats).forEach(([gender, count]) => {
        const percentage = ((count / data.length) * 100).toFixed(1);
        console.log(`   ${gender}: ${count} 人 (${percentage}%)`);
    });

    // 参赛项目分布
    const eventStats = data.reduce((acc, row) => {
        acc[row['参赛项目']] = (acc[row['参赛项目']] || 0) + 1;
        return acc;
    }, {});

    console.log('\n🏃 参赛项目分布:');
    Object.entries(eventStats).forEach(([event, count]) => {
        const percentage = ((count / data.length) * 100).toFixed(1);
        console.log(`   ${event}: ${count} 人 (${percentage}%)`);
    });

    // 服装尺码分布
    const sizeStats = data.reduce((acc, row) => {
        acc[row['服装尺码']] = (acc[row['服装尺码']] || 0) + 1;
        return acc;
    }, {});

    console.log('\n👕 服装尺码分布:');
    Object.entries(sizeStats).sort().forEach(([size, count]) => {
        const percentage = ((count / data.length) * 100).toFixed(1);
        console.log(`   ${size}: ${count} 人 (${percentage}%)`);
    });

    // 省份分布
    const provinceStats = data.reduce((acc, row) => {
        acc[row['省份']] = (acc[row['省份']] || 0) + 1;
        return acc;
    }, {});

    console.log('\n📍 省份分布（Top 10）:');
    Object.entries(provinceStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([province, count]) => {
            const percentage = ((count / data.length) * 100).toFixed(1);
            console.log(`   ${province}: ${count} 人 (${percentage}%)`);
        });

    // 年龄分布
    const ageGroups = {
        '20岁以下': 0,
        '20-29岁': 0,
        '30-39岁': 0,
        '40-49岁': 0,
        '50-59岁': 0,
        '60岁以上': 0
    };

    data.forEach(row => {
        const age = row['年龄'];
        if (age < 20) ageGroups['20岁以下']++;
        else if (age < 30) ageGroups['20-29岁']++;
        else if (age < 40) ageGroups['30-39岁']++;
        else if (age < 50) ageGroups['40-49岁']++;
        else if (age < 60) ageGroups['50-59岁']++;
        else ageGroups['60岁以上']++;
    });

    console.log('\n🎂 年龄分布:');
    Object.entries(ageGroups).forEach(([ageGroup, count]) => {
        if (count > 0) {
            const percentage = ((count / data.length) * 100).toFixed(1);
            console.log(`   ${ageGroup}: ${count} 人 (${percentage}%)`);
        }
    });

    // 成绩数据分布
    const fullMarathonPBCount = data.filter(r => r['全程马拉松最好成绩']).length;
    const halfMarathonPBCount = data.filter(r => r['半程马拉松最好成绩']).length;

    console.log('\n🏆 成绩数据分布:');
    console.log(`   有全程马拉松PB: ${fullMarathonPBCount} 人 (${((fullMarathonPBCount / data.length) * 100).toFixed(1)}%)`);
    console.log(`   有半程马拉松PB: ${halfMarathonPBCount} 人 (${((halfMarathonPBCount / data.length) * 100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(70));
}

// 主函数
async function main() {
    const count = process.argv[2] ? parseInt(process.argv[2]) : 2000;
    const outputFile = process.argv[3] || path.join(__dirname, 'fixtures', 'test-participants-2000.xlsx');

    console.log('='.repeat(70));
    console.log('ArcSpro 赛事名单导入系统测试数据生成器');
    console.log('='.repeat(70));
    console.log(`生成人数：${count}`);
    console.log(`输出文件：${outputFile}`);

    // 确保目录存在
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    console.log('\n正在生成测试数据...');
    const startTime = Date.now();
    const data = generateTestData(count);
    const generateTime = Date.now() - startTime;
    console.log(`✅ 数据生成完成，耗时 ${generateTime}ms`);

    console.log('\n正在写入 Excel 文件...');
    const writeStartTime = Date.now();
    await writeExcelFile(data, outputFile);
    const writeTime = Date.now() - writeStartTime;
    console.log(`✅ Excel 写入完成，耗时 ${writeTime}ms`);

    // 生成统计报告
    generateReport(data);

    console.log('\n✅ 测试数据生成全部完成！');
    console.log(`\n文件路径：${outputFile}`);
    console.log('\n使用说明：');
    console.log('1. 打开 ArcSpro 系统 -> 我的赛事 -> 名单导入');
    console.log('2. 选择目标赛事');
    console.log('3. 上传本文件');
    console.log('4. 进行字段映射和数据清洗');
    console.log('5. 确认导入后进入抽签管理进行测试');
}

main().catch(console.error);
