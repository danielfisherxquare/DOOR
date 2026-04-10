/**
 * Create 3D Assets Table
 * 创建 3D 资产库表，支持组织 + 全局公共库
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    // 1. 创建资产库表
    const assetsExists = await knex.schema.hasTable('inventory_3d_assets');
    if (!assetsExists) {
        await knex.schema.createTable('inventory_3d_assets', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('org_id').references('id').inTable('organizations').onDelete('CASCADE'); // NULL = 全局公共库
            table.uuid('creator_user_id').references('id').inTable('users').onDelete('SET NULL');

            // 基本信息
            table.text('name').notNullable();
            table.text('description');
            table.text('kind').notNullable().defaultTo('model'); // 'model' | 'parametric' | 'prefab'
            table.text('category').notNullable(); // 'furniture' | 'equipment' | 'structure' | 'decoration'
            table.specificType('tags', 'TEXT[]').defaultTo('{}');

            // 可见性（支持组织 + 全局公共库）
            table.text('visibility').notNullable().defaultTo('org'); // 'org' | 'public'

            // 文件存储
            table.text('file_type'); // 'glb' | 'gltf' | 'obj' | 'fbx'
            table.bigInteger('file_size');
            table.text('file_hash'); // SHA256 去重
            table.text('storage_path'); // 本地存储路径
            table.text('thumbnail_data_url'); // 缩略图 base64

            // 参数化模型
            table.jsonb('parameters_schema'); // Zod-like schema
            table.jsonb('default_parameters');

            // 元数据
            table.jsonb('bounding_box'); // { min: [x,y,z], max: [x,y,z] }
            table.jsonb('metadata');

            // 状态
            table.text('status').defaultTo('active'); // 'draft' | 'active' | 'archived'

            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['org_id']);
            table.index(['visibility']);
            table.index(['category']);
            table.index(['kind']);
            table.index(['org_id', 'visibility']);
            table.index(['file_hash']);
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_assets
            ADD CONSTRAINT inventory_3d_assets_kind_check
            CHECK (kind IN ('model', 'parametric', 'prefab'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_assets
            ADD CONSTRAINT inventory_3d_assets_visibility_check
            CHECK (visibility IN ('org', 'public'))
        `);

        await knex.raw(`
            ALTER TABLE inventory_3d_assets
            ADD CONSTRAINT inventory_3d_assets_status_check
            CHECK (status IN ('draft', 'active', 'archived'))
        `);
    }

    // 2. 创建资产实例表
    const instancesExists = await knex.schema.hasTable('inventory_3d_project_asset_instances');
    if (!instancesExists) {
        await knex.schema.createTable('inventory_3d_project_asset_instances', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('project_id').notNullable().references('id').inTable('inventory_3d_projects').onDelete('CASCADE');
            table.uuid('asset_id').notNullable().references('id').inTable('inventory_3d_assets').onDelete('CASCADE');

            // 变换信息
            table.jsonb('position').notNullable(); // { x, y, z }
            table.jsonb('rotation').defaultTo(JSON.stringify({ x: 0, y: 0, z: 0 }));
            table.jsonb('scale').defaultTo(JSON.stringify({ x: 1, y: 1, z: 1 }));

            // 参数覆盖
            table.jsonb('parameters'); // 覆盖资产默认参数

            // 运营绑定（可选）
            table.integer('bound_inventory_asset_id'); // 绑定到真实物资
            table.integer('bound_warehouse_location_id'); // 绑定到库位
            table.text('status').defaultTo('placed'); // 'placed' | 'reserved' | 'deployed'

            table.jsonb('metadata');
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
            table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

            table.index(['project_id']);
            table.index(['asset_id']);
            table.index(['project_id', 'asset_id']);
            table.index(['status']);
        });

        await knex.raw(`
            ALTER TABLE inventory_3d_project_asset_instances
            ADD CONSTRAINT inventory_3d_project_asset_instances_status_check
            CHECK (status IN ('placed', 'reserved', 'deployed', 'returned'))
        `);
    }

    // 3. 修改项目表，添加 primary_asset_id 字段
    const hasPrimaryAsset = await knex.schema.hasColumn('inventory_3d_projects', 'primary_asset_id');
    if (!hasPrimaryAsset) {
        await knex.schema.alterTable('inventory_3d_projects', (table) => {
            table.uuid('primary_asset_id').references('id').inTable('inventory_3d_assets').onDelete('SET NULL');
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    // 删除 project 表的列
    const hasPrimaryAsset = await knex.schema.hasColumn('inventory_3d_projects', 'primary_asset_id');
    if (hasPrimaryAsset) {
        await knex.schema.alterTable('inventory_3d_projects', (table) => {
            table.dropColumn('primary_asset_id');
        });
    }

    // 删除实例表
    await knex.raw('ALTER TABLE inventory_3d_project_asset_instances DROP CONSTRAINT IF EXISTS inventory_3d_project_asset_instances_status_check');
    await knex.schema.dropTableIfExists('inventory_3d_project_asset_instances');

    // 删除资产表
    await knex.raw('ALTER TABLE inventory_3d_assets DROP CONSTRAINT IF EXISTS inventory_3d_assets_status_check');
    await knex.raw('ALTER TABLE inventory_3d_assets DROP CONSTRAINT IF EXISTS inventory_3d_assets_visibility_check');
    await knex.raw('ALTER TABLE inventory_3d_assets DROP CONSTRAINT IF EXISTS inventory_3d_assets_kind_check');
    await knex.schema.dropTableIfExists('inventory_3d_assets');
}
