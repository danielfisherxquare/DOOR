/**
 * Credential Module — Step 2: 证件实例表
 * 
 * 用途：
 * - 存储实际生成的证件实例
 * - 保存所有快照数据 (模板、区域、地图、编号)
 * - 管理证件状态流转 (generated, printed, issued, returned, voided)
 * - 记录打印批次信息
 */

export async function up(knex) {
    await knex.schema.createTable('credential_credentials', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 证件编号 (唯一)
        t.text('credential_no').notNullable();
        
        // 关联申请
        t.bigInteger('application_id').notNullable()
            .references('id').inTable('credential_applications').onDelete('RESTRICT');
        
        // 快照数据 (固化申请时的信息，不受后续变更影响)
        t.text('role_name').notNullable(); // 岗位名称快照
        t.text('person_name').notNullable(); // 姓名快照
        t.text('org_name').nullable(); // 单位名称快照
        t.text('default_zone_code').nullable(); // 默认区域快照
        
        // 模板快照 JSON (包含 front_layout_json 和 back_layout_json)
        t.jsonb('template_snapshot_json').notNullable();
        
        // 地图快照 JSON (包含可通行区域的 GeoJSON 和说明)
        t.jsonb('map_snapshot_json').nullable();
        
        // 二维码 payload 和版本
        t.text('qr_payload').notNullable();
        t.integer('qr_version').notNullable().defaultTo(1);
        
        // 证件状态
        t.text('status').notNullable().defaultTo('generated');
        // generated, printed, issued, returned, voided
        
        // 打印信息
        t.bigInteger('print_batch_id').nullable()
            .references('id').inTable('credential_print_batches').onDelete('SET NULL');
        t.timestamp('printed_at', { useTz: true }).nullable();
        
        // 领取信息
        t.uuid('issued_to_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('issued_at', { useTz: true }).nullable();
        t.text('issue_source').nullable(); // 'manual', 'scan'
        
        // 归还信息
        t.timestamp('returned_at', { useTz: true }).nullable();
        t.text('return_remark').nullable();
        
        // 作废信息
        t.timestamp('voided_at', { useTz: true }).nullable();
        t.uuid('voided_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.text('void_reason').nullable();
        
        // 元数据
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        // 唯一性：同一赛事内 credential_no 唯一
        t.unique(['org_id', 'race_id', 'credential_no']);
        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
        t.index(['application_id']);
        t.index(['print_batch_id']);
        t.index(['qr_payload']); // 用于扫码查询
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_credentials IS '证件实例表'`);
    await knex.raw(`COMMENT ON COLUMN credential_credentials.credential_no IS '证件编号 (同一赛事内唯一)'`);
    await knex.raw(`COMMENT ON COLUMN credential_credentials.template_snapshot_json IS '模板快照 JSON'`);
    await knex.raw(`COMMENT ON COLUMN credential_credentials.map_snapshot_json IS '地图快照 JSON'`);
    await knex.raw(`COMMENT ON COLUMN credential_credentials.status IS '证件状态：generated, printed, issued, returned, voided'`);
    await knex.raw(`COMMENT ON COLUMN credential_credentials.qr_payload IS '二维码 payload (加密或编码后的数据)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_credentials');
}
