/**
 * Credential Module — Step 2: 证件申请表
 * 
 * 用途：
 * - 管理证件申请流程
 * - 记录申请人信息、申请岗位、默认区域、审核状态
 * - 支持审核流程，记录审核人、审核时间、审核意见
 */

export async function up(knex) {
    await knex.schema.createTable('credential_applications', (t) => {
        t.bigIncrements('id').primary();
        t.uuid('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
        t.bigInteger('race_id').notNullable().references('id').inTable('races').onDelete('CASCADE');
        
        // 申请人信息
        t.uuid('applicant_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.text('person_name').notNullable();
        t.text('org_name').nullable(); // 所属单位名称
        
        // 申请岗位
        t.bigInteger('role_template_id').notNullable()
            .references('id').inTable('credential_role_templates').onDelete('RESTRICT');
        t.text('role_name').notNullable(); // 冗余存储，快照用
        
        // 默认区域 (来自岗位模板，可被审核时调整)
        t.text('default_zone_code').nullable();
        
        // 申请状态
        t.text('status').notNullable().defaultTo('draft');
        // draft, submitted, under_review, approved, rejected, generated, voided
        
        // 审核信息
        t.uuid('reviewer_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.timestamp('reviewed_at', { useTz: true }).nullable();
        t.text('review_remark').nullable(); // 审核意见
        t.text('reject_reason').nullable(); // 驳回原因
        
        // 申请信息
        t.text('remark').nullable(); // 申请人备注
        t.text('custom_fields').nullable(); // 自定义字段 JSON
        
        // 元数据
        t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        t.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
        
        t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        t.index(['org_id', 'race_id']);
        t.index(['race_id', 'status']);
        t.index(['applicant_user_id']);
        t.index(['role_template_id']);
    });

    // 添加注释
    await knex.raw(`COMMENT ON TABLE credential_applications IS '证件申请表'`);
    await knex.raw(`COMMENT ON COLUMN credential_applications.status IS '申请状态：draft, submitted, under_review, approved, rejected, generated, voided'`);
    await knex.raw(`COMMENT ON COLUMN credential_applications.default_zone_code IS '默认区域编码 (来自岗位模板)'`);
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('credential_applications');
}
