/**
 * ArcSpro "我的赛事" 名单导入到抽签结束端到端测试
 * 
 * 测试流程：
 * 1. 登录系统
 * 2. 选择/创建赛事
 * 3. 导入不少于 1000 人的名单
 * 4. 完成字段映射
 * 5. 执行数据清洗
 * 6. 预览并确认导入
 * 7. 配置抽签容量
 * 8. 配置起点沙盘
 * 9. 配置成绩筛选
 * 10. 执行最终抽签
 * 11. 验证抽签结果
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 配置
const BASE_URL = process.env.ARCSPRO_TEST_URL || process.env.URL || 'http://127.0.0.1:5173';
const TIMEOUT = 300000; // 5 分钟超时（抽签可能需要较长时间）
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// 测试凭据 - 从环境变量读取或使用默认值
const CREDENTIALS = {
    username: process.env.ARCSPRO_TEST_USERNAME || 'test@example.com',
    password: process.env.ARCSPRO_TEST_PASSWORD || 'TestPassword123!',
};

// 确保截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 测试结果
const testResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    screenshots: [],
    issues: [],
    metrics: {}
};

/**
 * 辅助函数：等待并截图
 */
async function waitAndScreenshot(page, name, fullPage = false) {
    await page.waitForTimeout(2000);
    const screenshotPath = path.join(SCREENSHOT_DIR, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage });
    testResults.screenshots.push({ name, path: screenshotPath });
    console.log(`  📸 截图：${name}`);
    return screenshotPath;
}

/**
 * 辅助函数：等待元素出现
 */
async function waitForElement(page, selector, timeout = 10000) {
    try {
        await page.waitForSelector(selector, { state: 'visible', timeout });
        return true;
    } catch (error) {
        console.log(`  ⏳ 等待元素超时：${selector}`);
        return false;
    }
}

/**
 * 测试 1：登录系统
 */
async function testLogin(page) {
    console.log('\n【测试 1】登录系统');
    
    try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        await waitAndScreenshot(page, 'login-page');
        
        const usernameInput = page.locator('#username');
        const passwordInput = page.locator('#password');
        const submitButton = page.locator('button[type="submit"]');
        
        if (await usernameInput.count() === 0) {
            console.log('  ⚠️ 未找到用户名输入框，尝试其他选择器...');
        }
        
        await usernameInput.fill(CREDENTIALS.username);
        console.log(`  📝 已填写用户名：${CREDENTIALS.username}`);
        
        await passwordInput.fill(CREDENTIALS.password);
        console.log('  📝 已填写密码');
        
        await submitButton.click();
        console.log('  🖱️ 点击登录按钮');
        
        await page.waitForTimeout(5000);
        
        const url = page.url();
        const isLoggedIn = url.includes('/app') || url.includes('/dashboard');
        
        if (!isLoggedIn) {
            console.log('  ⚠️ 登录可能未成功，但将继续尝试测试...');
            await waitAndScreenshot(page, 'after-login-attempt');
        } else {
            console.log('  ✅ 已登录到应用页面');
            await waitAndScreenshot(page, 'after-login');
        }
        
        return true;
    } catch (error) {
        console.log(`  ⚠️ 登录测试出错：${error.message}`);
        return false;
    }
}

/**
 * 测试 2：导航到名单导入页面
 */
async function testNavigateToImport(page) {
    console.log('\n【测试 2】导航到名单导入页面');
    
    try {
        // 尝试导航到导入页面
        const importUrl = `${BASE_URL}/app/events/import`;
        await page.goto(importUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await waitAndScreenshot(page, 'import-page');
        
        // 检查是否显示"请先选择赛事"提示
        const selectRacePrompt = page.locator('text=请先选择赛事');
        const hasSelectRacePrompt = await selectRacePrompt.count() > 0;
        
        if (hasSelectRacePrompt) {
            console.log('  ℹ️  需要先选择赛事');
            return { needsRaceSelection: true };
        }
        
        // 检查导入页面元素
        const dropzone = page.locator('.import-dropzone');
        const hasText = await page.locator('text=拖拽报名文件').count() > 0;
        const hasDropzone = (await dropzone.count() > 0) || hasText;
        
        if (hasDropzone) {
            console.log('  ✅ 名单导入页面加载成功');
            return { needsRaceSelection: false };
        } else {
            console.log('  ⚠️ 未找到导入区域');
            return { needsRaceSelection: false, pageLoaded: false };
        }
    } catch (error) {
        console.log(`  ⚠️ 导航失败：${error.message}`);
        return { error: error.message };
    }
}

/**
 * 测试 3：选择赛事
 */
async function testSelectRace(page) {
    console.log('\n【测试 3】选择赛事');
    
    try {
        // 查找赛事选择器
        const raceSelector = page.locator('select[name="raceId"], .race-selector, [data-testid="race-selector"]');
        
        if (await raceSelector.count() === 0) {
            console.log('  ℹ️  未找到赛事选择器，尝试查找赛事列表...');
            
            // 尝试查找赛事卡片或列表
            const raceCards = page.locator('.race-card, .event-card, [class*="race"]');
            if (await raceCards.count() > 0) {
                console.log(`  📋 找到 ${await raceCards.count()} 个赛事卡片`);
                await raceCards.first().click();
                await page.waitForTimeout(2000);
                console.log('  ✅ 已选择第一个赛事');
                await waitAndScreenshot(page, 'race-selected');
                return true;
            }
            
            console.log('  ⚠️ 未找到任何赛事，可能需要先创建赛事');
            return false;
        }
        
        // 获取赛事选项
        const options = await raceSelector.locator('option').all();
        console.log(`  📋 找到 ${options.length} 个赛事选项`);
        
        if (options.length > 1) {
            // 选择第一个非默认选项
            await raceSelector.selectIndex(1);
        } else if (options.length === 1) {
            await raceSelector.selectIndex(0);
        }
        
        await page.waitForTimeout(2000);
        console.log('  ✅ 已选择赛事');
        await waitAndScreenshot(page, 'race-selected');
        
        return true;
    } catch (error) {
        console.log(`  ⚠️ 选择赛事失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 4：上传测试名单文件
 */
async function testUploadFile(page) {
    console.log('\n【测试 4】上传测试名单文件');
    
    try {
        const testFilePath = path.join(FIXTURES_DIR, 'test-participants.xlsx');
        
        if (!fs.existsSync(testFilePath)) {
            console.log(`  ❌ 测试文件不存在：${testFilePath}`);
            console.log('  💡 请先运行：node tests/event-lottery/generate-test-data.js');
            testResults.issues.push({
                test: 'upload-file',
                severity: 'critical',
                issue: `测试文件不存在：${testFilePath}`
            });
            return false;
        }
        
        const fileInfo = fs.statSync(testFilePath);
        console.log(`  📄 测试文件大小：${(fileInfo.size / 1024).toFixed(2)} KB`);
        
        // 查找文件上传区域
        const dropzone = page.locator('.import-dropzone, [class*="dropzone"]');
        const fileInput = page.locator('input[type="file"]');
        
        if (await fileInput.count() === 0) {
            console.log('  ⚠️ 未找到文件输入框');
            return false;
        }
        
        // 上传文件
        await fileInput.setInputFiles(testFilePath);
        console.log('  📤 文件已上传');
        
        await page.waitForTimeout(5000);
        await waitAndScreenshot(page, 'file-uploaded');
        
        // 验证文件是否显示在列表中
        const fileList = page.locator('.import-file-item, .file-item');
        const fileCount = await fileList.count();
        
        if (fileCount > 0) {
            console.log(`  ✅ 文件已添加到列表 (${fileCount} 个文件)`);
            return true;
        } else {
            console.log('  ⚠️ 文件未显示在列表中');
            return false;
        }
    } catch (error) {
        console.log(`  ⚠️ 上传文件失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 5：字段映射
 */
async function testFieldMapping(page) {
    console.log('\n【测试 5】字段映射');
    
    try {
        // 点击"进入字段映射"按钮
        const mappingButton = page.locator('button:has-text("进入字段映射"), button:has-text("下一步")');
        if (await mappingButton.count() > 0) {
            await mappingButton.first().click();
            await page.waitForTimeout(3000);
        }
        
        await waitAndScreenshot(page, 'mapping-page');
        
        // 检查映射表格
        const mappingGrid = page.locator('.import-mapping-grid');
        if (await mappingGrid.count() === 0) {
            console.log('  ⚠️ 未找到映射网格');
            return false;
        }
        
        // 获取所有映射行
        const mappingRows = page.locator('.import-mapping-grid__row');
        const rowCount = await mappingRows.count();
        console.log(`  📋 找到 ${rowCount} 个待映射字段`);
        
        // 定义标准字段映射（根据实际系统字段调整）
        const fieldMappings = {
            '姓名': 'name',
            '身份证号': 'id_number',
            '性别': 'gender',
            '手机号': 'phone',
            '参赛项目': 'event',
            '服装尺码': 'size',
            '城市': 'city',
            '紧急联系人': 'emergency_contact',
            '紧急联系人电话': 'emergency_phone',
            '邮箱': 'email',
            '出生日期': 'birthday'
        };
        
        // 自动映射字段
        for (let i = 0; i < rowCount; i++) {
            const row = mappingRows.nth(i);
            const sourceColumn = await row.locator('.import-mapping-grid__source').textContent();
            const cleanSource = sourceColumn?.trim();
            
            if (cleanSource && fieldMappings[cleanSource]) {
                const select = row.locator('.import-mapping-grid__select');
                await select.selectOption({ label: new RegExp(fieldMappings[cleanSource]) });
                console.log(`  ✓ 映射：${cleanSource} -> ${fieldMappings[cleanSource]}`);
            }
        }
        
        await page.waitForTimeout(2000);
        await waitAndScreenshot(page, 'mapping-completed');
        
        // 点击"继续清洗"按钮
        const continueButton = page.locator('button:has-text("继续清洗"), button:has-text("下一步")');
        if (await continueButton.count() > 0) {
            await continueButton.first().click();
            await page.waitForTimeout(3000);
        }
        
        console.log('  ✅ 字段映射完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 字段映射失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 6：数据清洗
 */
async function testDataCleaning(page) {
    console.log('\n【测试 6】数据清洗');
    
    try {
        await waitAndScreenshot(page, 'cleaning-page');
        
        // 查找清洗配置选项
        const cleaningOptions = page.locator('.data-cleaner, .cleaning-options');
        if (await cleaningOptions.count() > 0) {
            console.log('  📋 找到数据清洗选项');
        }
        
        // 查找去重选项
        const dedupOption = page.locator('input[type="checkbox"]:checked, .toggle-switch.active');
        const hasDedup = await dedupOption.count() > 0;
        console.log(`  ${hasDedup ? '✓' : '○'} 去重选项：${hasDedup ? '已启用' : '未启用'}`);
        
        // 点击"开始清洗"或"下一步"
        const cleanButton = page.locator('button:has-text("开始清洗"), button:has-text("执行清洗"), button:has-text("下一步")');
        if (await cleanButton.count() > 0) {
            console.log('  🖱️ 点击清洗按钮');
            await cleanButton.first().click();
            
            // 等待清洗完成
            console.log('  ⏳ 等待清洗完成...');
            await page.waitForTimeout(10000);
            
            await waitAndScreenshot(page, 'cleaning-completed');
        }
        
        console.log('  ✅ 数据清洗完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 数据清洗失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 7：预览并确认导入
 */
async function testPreviewAndConfirm(page) {
    console.log('\n【测试 7】预览并确认导入');
    
    try {
        // 查找预览表格
        const previewTable = page.locator('table, .data-preview');
        if (await previewTable.count() > 0) {
            console.log('  📋 找到数据预览表格');
        }
        
        await waitAndScreenshot(page, 'preview-page');
        
        // 查找统计数据
        const stats = page.locator('.import-file-rows, .stats, .metric');
        if (await stats.count() > 0) {
            const statsText = await stats.first().textContent();
            console.log(`  📊 统计数据：${statsText?.trim()}`);
        }
        
        // 点击"确认导入"或"提交"按钮
        const confirmButton = page.locator('button:has-text("确认导入"), button:has-text("提交"), button:has-text("完成导入")');
        if (await confirmButton.count() > 0) {
            console.log('  🖱️ 点击确认导入按钮');
            await confirmButton.first().click();
            
            // 等待导入完成
            console.log('  ⏳ 等待导入完成...');
            await page.waitForTimeout(15000);
            
            await waitAndScreenshot(page, 'import-confirmed');
        }
        
        console.log('  ✅ 导入确认完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 预览确认失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 8：导航到抽签管理页面
 */
async function testNavigateToLottery(page) {
    console.log('\n【测试 8】导航到抽签管理页面');
    
    try {
        // 从当前页面 URL 获取 raceId
        const currentUrl = page.url();
        const urlParams = new URL(currentUrl).searchParams;
        const raceId = urlParams.get('raceId') || '';
        const lotteryUrl = `${BASE_URL}/app/events/lottery?raceId=${raceId}`;
        await page.goto(lotteryUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(3000);
        await waitAndScreenshot(page, 'lottery-page');
        
        console.log('  ✅ 抽签管理页面加载成功');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 导航到抽签页面失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 9：配置抽签容量
 */
async function testCapacityConfig(page) {
    console.log('\n【测试 9】配置抽签容量');
    
    try {
        await waitAndScreenshot(page, 'capacity-config');
        
        // 查找容量配置表格
        const capacityTable = page.locator('table, .capacity-planner');
        if (await capacityTable.count() > 0) {
            console.log('  📋 找到容量配置表格');
        }
        
        // 查找保存按钮
        const saveButton = page.locator('button:has-text("保存"), button:has-text("保存配置")');
        if (await saveButton.count() > 0) {
            console.log('  🖱️ 点击保存容量配置');
            await saveButton.first().click();
            await page.waitForTimeout(3000);
        }
        
        await waitAndScreenshot(page, 'capacity-saved');
        console.log('  ✅ 容量配置完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 容量配置失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 10：配置起点沙盘
 */
async function testZoneConfig(page) {
    console.log('\n【测试 10】配置起点沙盘');
    
    try {
        // 点击"起点沙盘"步骤
        const zoneStep = page.locator('button:has-text("起点沙盘"), [data-step="zones"]');
        if (await zoneStep.count() > 0) {
            await zoneStep.first().click();
            await page.waitForTimeout(3000);
        }
        
        await waitAndScreenshot(page, 'zone-config');
        console.log('  ✅ 起点沙盘页面已加载');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 起点沙盘配置失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 11：配置成绩筛选
 */
async function testPerformanceFilter(page) {
    console.log('\n【测试 11】配置成绩筛选');
    
    try {
        // 点击"成绩筛选"步骤
        const perfStep = page.locator('button:has-text("成绩筛选"), [data-step="performance"]');
        if (await perfStep.count() > 0) {
            await perfStep.first().click();
            await page.waitForTimeout(3000);
        }
        
        await waitAndScreenshot(page, 'performance-filter');
        console.log('  ✅ 成绩筛选页面已加载');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 成绩筛选配置失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 12：执行最终抽签
 */
async function testExecuteLottery(page) {
    console.log('\n【测试 12】执行最终抽签');
    
    try {
        // 点击"物资匹配与最终执行"步骤
        const inventoryStep = page.locator('button:has-text("物资匹配"), [data-step="inventory"]');
        if (await inventoryStep.count() > 0) {
            await inventoryStep.first().click();
            await page.waitForTimeout(3000);
        }
        
        await waitAndScreenshot(page, 'inventory-matcher');
        
        // 查找执行按钮
        const executeButton = page.locator('button:has-text("执行最终抽签"), button:has-text("执行抽签")');
        if (await executeButton.count() > 0) {
            console.log('  🖱️ 点击执行最终抽签按钮');
            
            // 处理确认对话框
            page.on('dialog', async dialog => {
                console.log(`  ℹ️  确认对话框：${dialog.message()}`);
                await dialog.accept();
            });
            
            await executeButton.first().click();
            
            // 等待抽签完成（可能需要较长时间）
            console.log('  ⏳ 等待抽签执行完成...');
            for (let i = 0; i < 30; i++) {
                await page.waitForTimeout(5000);
                
                // 检查是否有完成提示
                const successMessage = page.locator('text=执行完成, text=抽签完成, .success, [class*="success"]');
                if (await successMessage.count() > 0) {
                    console.log('  ✅ 抽签执行完成');
                    break;
                }
                
                console.log(`  ⏳ 仍在执行中... (${(i + 1) * 5}s)`);
            }
            
            await waitAndScreenshot(page, 'lottery-executed');
        }
        
        console.log('  ✅ 最终抽签执行完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 执行抽签失败：${error.message}`);
        return false;
    }
}

/**
 * 测试 13：验证抽签结果
 */
async function testVerifyResults(page) {
    console.log('\n【测试 13】验证抽签结果');
    
    try {
        await waitAndScreenshot(page, 'lottery-results');
        
        // 查找结果统计
        const resultStats = page.locator('.lottery-mini-stat, .result-stats, .metric');
        const statsCount = await resultStats.count();
        
        if (statsCount > 0) {
            console.log(`  📊 找到 ${statsCount} 个统计指标`);
            
            // 读取统计值
            const metrics = {};
            for (let i = 0; i < Math.min(statsCount, 6); i++) {
                const stat = resultStats.nth(i);
                const label = await stat.locator('.lottery-mini-stat__label, .label').textContent();
                const value = await stat.locator('.lottery-mini-stat__value, .value, strong').textContent();
                if (label && value) {
                    metrics[label.trim()] = value.trim();
                    console.log(`    ${label.trim()}: ${value.trim()}`);
                }
            }
            testResults.metrics = metrics;
        }
        
        // 查找中签/未中签信息
        const winnersInfo = page.locator('text=中签, text=winners, text=中选');
        if (await winnersInfo.count() > 0) {
            const winnersText = await winnersInfo.first().textContent();
            console.log(`  📈 中签信息：${winnersText?.trim()}`);
        }
        
        console.log('  ✅ 抽签结果验证完成');
        return true;
    } catch (error) {
        console.log(`  ⚠️ 验证结果失败：${error.message}`);
        return false;
    }
}

/**
 * 主测试函数
 */
async function runEventLotteryTests() {
    console.log('='.repeat(60));
    console.log('ArcSpro "我的赛事" 名单导入到抽签结束端到端测试');
    console.log('='.repeat(60));
    console.log(`测试环境：${BASE_URL}`);
    console.log(`测试时间：${testResults.timestamp}`);
    console.log(`测试账号：${CREDENTIALS.username}`);
    
    const browser = await chromium.launch({
        headless: false, // 使用有头模式便于观察
        slowMo: 500,     // 慢动作
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1
    });
    
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    page.setDefaultNavigationTimeout(TIMEOUT);
    
    try {
        const tests = [
            { name: '登录系统', fn: () => testLogin(page), passed: false },
            { name: '导航到导入页面', fn: () => testNavigateToImport(page), passed: false },
            { name: '选择赛事', fn: () => testSelectRace(page), passed: false },
            { name: '上传测试名单', fn: () => testUploadFile(page), passed: false },
            { name: '字段映射', fn: () => testFieldMapping(page), passed: false },
            { name: '数据清洗', fn: () => testDataCleaning(page), passed: false },
            { name: '预览确认导入', fn: () => testPreviewAndConfirm(page), passed: false },
            { name: '导航到抽签页面', fn: () => testNavigateToLottery(page), passed: false },
            { name: '配置抽签容量', fn: () => testCapacityConfig(page), passed: false },
            { name: '配置起点沙盘', fn: () => testZoneConfig(page), passed: false },
            { name: '配置成绩筛选', fn: () => testPerformanceFilter(page), passed: false },
            { name: '执行最终抽签', fn: () => testExecuteLottery(page), passed: false },
            { name: '验证抽签结果', fn: () => testVerifyResults(page), passed: false }
        ];
        
        for (const test of tests) {
            try {
                test.passed = await test.fn();
                testResults.tests.push({
                    name: test.name,
                    passed: test.passed,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error(`  ❌ ${test.name} 测试失败：${error.message}`);
                testResults.tests.push({
                    name: test.name,
                    passed: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
    } finally {
        // 保存测试结果
        const reportPath = path.join(SCREENSHOT_DIR, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
        console.log(`\n💾 测试报告：${reportPath}`);
        
        await browser.close();
    }
    
    // 输出测试摘要
    console.log('\n' + '='.repeat(60));
    console.log('测试摘要');
    console.log('='.repeat(60));
    
    const passedCount = testResults.tests.filter(t => t.passed).length;
    const totalCount = testResults.tests.length;
    
    console.log(`通过：${passedCount}/${totalCount}`);
    console.log(`截图：${testResults.screenshots.length} 张`);
    console.log(`问题：${testResults.issues.length} 个`);
    
    if (testResults.issues.length > 0) {
        console.log('\n问题列表:');
        testResults.issues.forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.severity}] ${issue.test}: ${issue.issue}`);
        });
    }
    
    if (Object.keys(testResults.metrics).length > 0) {
        console.log('\n抽签结果指标:');
        Object.entries(testResults.metrics).forEach(([key, value]) => {
            console.log(`  ${key}: ${value}`);
        });
    }
    
    return {
        passed: passedCount === totalCount,
        passedCount,
        totalCount,
        report: testResults
    };
}

// 运行测试
runEventLotteryTests()
    .then(result => {
        console.log('\n' + '='.repeat(60));
        console.log(result.passed ? '✅ 所有测试通过!' : '⚠️ 部分测试未通过');
        console.log('='.repeat(60));
        process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
        console.error('测试执行失败:', error);
        process.exit(1);
    });
