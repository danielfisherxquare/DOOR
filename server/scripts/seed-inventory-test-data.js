/**
 * 仓储管理模块测试数据生成脚本
 * 运行: node scripts/seed-inventory-test-data.js
 */
import knex from '../src/db/knex.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const TEST_ORG_ID = 'a0000001-0000-0000-0000-000000000001';
const TEST_USER_ID = 'a0000002-0000-0000-0000-000000000001';

async function main() {
    console.log('🚀 开始生成测试数据...\n');

    try {
        // 1. 创建测试机构
        console.log('📦 创建测试机构...');
        await knex('organizations').insert({
            id: TEST_ORG_ID,
            name: '测试马拉松组委会',
            slug: 'test-marathon-org',
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
        }).onConflict('id').ignore();
        console.log('   ✓ 测试机构创建成功\n');

        // 2. 创建测试用户
        console.log('👤 创建测试用户...');
        const existingUser = await knex('users').where({ username: 'inventory_tester' }).first();
        if (!existingUser) {
            const passwordHash = await bcrypt.hash('test123456', 10);
            await knex('users').insert({
                id: TEST_USER_ID,
                org_id: TEST_ORG_ID,
                username: 'inventory_tester',
                email: 'inventory@test.com',
                password_hash: passwordHash,
                role: 'org_admin',
                status: 'active',
                created_at: knex.fn.now(),
                updated_at: knex.fn.now(),
            });
        }
        console.log('   ✓ 测试用户就绪 (用户名: inventory_tester, 密码: test123456)\n');

        // 3. 创建仓库
        console.log('🏭 创建仓库...');
        await knex('warehouses').insert({
            org_id: TEST_ORG_ID, code: 'WH001', name: '主仓库', address: '北京市朝阳区体育中心1号库', contact: '张三', status: 'active'
        }).onConflict(['org_id', 'code']).ignore();
        await knex('warehouses').insert({
            org_id: TEST_ORG_ID, code: 'WH002', name: '备用仓库', address: '北京市海淀区奥体中心2号库', contact: '李四', status: 'active'
        }).onConflict(['org_id', 'code']).ignore();

        const warehouses = await knex('warehouses').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${warehouses.length} 个仓库\n`);

        // 4. 创建库位
        console.log('📍 创建库位...');
        const existingLocations = await knex('warehouse_locations').where({ warehouse_id: warehouses[0].id });
        if (existingLocations.length === 0) {
            const locations = [];
            const zones = ['A', 'B', 'C'];
            for (const wh of warehouses) {
                for (const zone of zones) {
                    for (let aisle = 1; aisle <= 2; aisle++) {
                        for (let shelf = 1; shelf <= 3; shelf++) {
                            for (let pos = 1; pos <= 4; pos++) {
                                locations.push({
                                    org_id: TEST_ORG_ID,
                                    warehouse_id: wh.id,
                                    code: `${wh.code}-${zone}${aisle}-${String(shelf).padStart(2, '0')}-${String(pos).padStart(2, '0')}`,
                                    zone: `${zone}区`,
                                    aisle: `${aisle}排`,
                                    shelf: `${shelf}层`,
                                    position: `${pos}位`,
                                    capacity: 100,
                                    used_capacity: 0,
                                    status: 'active',
                                });
                            }
                        }
                    }
                }
            }
            await knex('warehouse_locations').insert(locations);
        }
        const allLocations = await knex('warehouse_locations').whereIn('warehouse_id', warehouses.map(w => w.id));
        console.log(`   ✓ 创建/已有 ${allLocations.length} 个库位\n`);

        // 5. 创建批次
        console.log('📦 创建批次...');
        const batchData = [
            { org_id: TEST_ORG_ID, batch_name: '2024春季参赛服', batch_type: 'clothing', supplier: '耐克体育', total_quantity: 0, status: 'active' },
            { org_id: TEST_ORG_ID, batch_name: '2024春季完赛奖牌', batch_type: 'medal', supplier: '金牌制造', total_quantity: 0, status: 'active' },
            { org_id: TEST_ORG_ID, batch_name: '2024春季参赛包', batch_type: 'bag', supplier: '运动装备厂', total_quantity: 0, status: 'active' },
            { org_id: TEST_ORG_ID, batch_name: '2024秋季参赛服', batch_type: 'clothing', supplier: '阿迪达斯', total_quantity: 0, status: 'active' },
        ];
        for (const batch of batchData) {
            await knex('org_inventory_batches').insert(batch).onConflict().ignore();
        }
        const batches = await knex('org_inventory_batches').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${batches.length} 个批次\n`);

        // 6. 创建物资
        console.log('👕 创建物资...');
        const existingUnits = await knex('org_inventory_units').where({ org_id: TEST_ORG_ID });
        if (existingUnits.length === 0) {
            const units = [];
            const sizes = ['S', 'M', 'L', 'XL', '2XL'];
            const genders = ['M', 'F'];
            let seq = 0;

            const clothingBatch = batches.find(b => b.batch_name === '2024春季参赛服');
            if (clothingBatch) {
                for (const size of sizes) {
                    for (const gender of genders) {
                        for (let i = 0; i < 20; i++) {
                            seq++;
                            const qrCode = `TEST-CLOTH-${String(clothingBatch.id).padStart(4, '0')}-${String(seq).padStart(6, '0')}`;
                            units.push({
                                org_id: TEST_ORG_ID,
                                batch_id: clothingBatch.id,
                                qr_code: qrCode,
                                item_type: 'clothing',
                                item_category: gender === 'M' ? '男子参赛服' : '女子参赛服',
                                item_spec: JSON.stringify({ size, gender }),
                                status: i < 5 ? 'allocated' : 'in_stock',
                                warehouse_id: warehouses[0]?.id,
                                location_id: allLocations[seq % allLocations.length]?.id,
                            });
                        }
                    }
                }
            }

            const medalBatch = batches.find(b => b.batch_name === '2024春季完赛奖牌');
            if (medalBatch) {
                for (let i = 0; i < 100; i++) {
                    seq++;
                    const qrCode = `TEST-MEDAL-${String(medalBatch.id).padStart(4, '0')}-${String(i + 1).padStart(6, '0')}`;
                    units.push({
                        org_id: TEST_ORG_ID,
                        batch_id: medalBatch.id,
                        qr_code: qrCode,
                        item_type: 'medal',
                        item_category: '完赛奖牌',
                        item_spec: JSON.stringify({ type: 'finisher' }),
                        status: 'in_stock',
                        warehouse_id: warehouses[0]?.id,
                    });
                }
                await knex('org_inventory_batches').where({ id: medalBatch.id }).update({ total_quantity: 100 });
            }

            const bagBatch = batches.find(b => b.batch_name === '2024春季参赛包');
            if (bagBatch) {
                for (let i = 0; i < 50; i++) {
                    seq++;
                    const qrCode = `TEST-BAG-${String(bagBatch.id).padStart(4, '0')}-${String(i + 1).padStart(6, '0')}`;
                    units.push({
                        org_id: TEST_ORG_ID,
                        batch_id: bagBatch.id,
                        qr_code: qrCode,
                        item_type: 'bag',
                        item_category: '参赛包',
                        item_spec: JSON.stringify({ color: '蓝色' }),
                        status: i < 10 ? 'picked' : 'in_stock',
                        warehouse_id: warehouses[0]?.id,
                    });
                }
                await knex('org_inventory_batches').where({ id: bagBatch.id }).update({ total_quantity: 50 });
            }

            for (let i = 0; i < units.length; i += 100) {
                await knex('org_inventory_units').insert(units.slice(i, i + 100));
            }

            if (clothingBatch) {
                await knex('org_inventory_batches').where({ id: clothingBatch.id }).update({ total_quantity: 200 });
            }
        }
        const allUnits = await knex('org_inventory_units').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${allUnits.length} 个物资\n`);

        // 7. 创建预警规则
        console.log('⚠️  创建预警规则...');
        const existingRules = await knex('inventory_alert_rules').where({ org_id: TEST_ORG_ID });
        if (existingRules.length === 0) {
            await knex('inventory_alert_rules').insert({
                org_id: TEST_ORG_ID, rule_type: 'low_stock', item_type: 'clothing', threshold_value: 10, threshold_type: 'quantity', notify_channels: JSON.stringify(['in_app']), is_enabled: true
            });
            await knex('inventory_alert_rules').insert({
                org_id: TEST_ORG_ID, rule_type: 'low_stock', item_type: 'medal', threshold_value: 50, threshold_type: 'quantity', notify_channels: JSON.stringify(['in_app']), is_enabled: true
            });
        }
        const alertRules = await knex('inventory_alert_rules').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${alertRules.length} 条预警规则\n`);

        // 8. 创建预警记录
        console.log('🔔 创建预警记录...');
        const existingAlerts = await knex('inventory_alerts').where({ org_id: TEST_ORG_ID });
        if (existingAlerts.length === 0 && alertRules.length > 0) {
            await knex('inventory_alerts').insert({
                org_id: TEST_ORG_ID, rule_id: alertRules[0].id, alert_type: 'low_stock', severity: 'warning', title: '服装库存不足', content: '男子参赛服L码库存低于10件', is_read: false, is_resolved: false
            });
            await knex('inventory_alerts').insert({
                org_id: TEST_ORG_ID, rule_id: alertRules[1]?.id || alertRules[0].id, alert_type: 'low_stock', severity: 'info', title: '奖牌库存提醒', content: '完赛奖牌库存为100件', is_read: true, is_resolved: false
            });
        }
        const allAlerts = await knex('inventory_alerts').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${allAlerts.length} 条预警记录\n`);

        // 9. 创建盘点计划
        console.log('📋 创建盘点计划...');
        const existingPlans = await knex('stocktaking_plans').where({ org_id: TEST_ORG_ID });
        if (existingPlans.length === 0) {
            await knex('stocktaking_plans').insert({
                org_id: TEST_ORG_ID, warehouse_id: warehouses[0]?.id, plan_name: '2024年Q1全面盘点', plan_type: 'full', status: 'completed', total_items: 200, counted_items: 200, diff_items: 3
            });
            await knex('stocktaking_plans').insert({
                org_id: TEST_ORG_ID, warehouse_id: warehouses[0]?.id, plan_name: '服装区抽盘', plan_type: 'partial', status: 'in_progress', total_items: 100, counted_items: 60, diff_items: 0
            });
        }
        const allPlans = await knex('stocktaking_plans').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${allPlans.length} 个盘点计划\n`);

        // 10. 创建流转记录
        console.log('📝 创建流转记录...');
        const existingTrans = await knex('inventory_transactions').where({ org_id: TEST_ORG_ID });
        if (existingTrans.length === 0 && allUnits.length > 0) {
            await knex('inventory_transactions').insert({
                org_id: TEST_ORG_ID, unit_id: allUnits[0].id, transaction_type: 'inbound', from_holder_type: 'supplier', to_holder_type: 'warehouse', operator_id: TEST_USER_ID
            });
            await knex('inventory_transactions').insert({
                org_id: TEST_ORG_ID, unit_id: allUnits[1].id, transaction_type: 'allocate', from_holder_type: 'warehouse', to_holder_type: 'race', operator_id: TEST_USER_ID
            });
        }
        const allTrans = await knex('inventory_transactions').where({ org_id: TEST_ORG_ID });
        console.log(`   ✓ 创建/已有 ${allTrans.length} 条流转记录\n`);

        console.log('✅ 测试数据生成完成！\n');
        console.log('📊 数据统计:');
        console.log(`   - 机构: 1`);
        console.log(`   - 用户: 1 (inventory_tester / test123456)`);
        console.log(`   - 仓库: ${warehouses.length}`);
        console.log(`   - 库位: ${allLocations.length}`);
        console.log(`   - 批次: ${batches.length}`);
        console.log(`   - 物资: ${allUnits.length}`);
        console.log(`   - 预警规则: ${alertRules.length}`);
        console.log(`   - 预警记录: ${allAlerts.length}`);
        console.log(`   - 盘点计划: ${allPlans.length}`);
        console.log(`   - 流转记录: ${allTrans.length}`);
        console.log('\n🌐 请访问 http://localhost:5173/admin/inventory 查看测试数据');
        console.log('\n🔑 登录信息:');
        console.log('   - 超级管理员: Xquareliu / lk930813');
        console.log('   - 机构管理员: inventory_tester / test123456');

    } catch (err) {
        console.error('❌ 生成测试数据失败:', err);
        throw err;
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });