/**
 * 创建30人测试团队 - 中奥致远体育文化传播有限公司
 */
import knex from './src/db/knex.js';
import { encryptField } from './src/modules/team/team-crypto.js';
import bcrypt from 'bcryptjs';

// 中奥致远的机构ID (从之前的测试页面可以看到)
const ORG_ID = 'a0000002-0000-0000-0000-000000000002';

// 部门列表
const departments = [
  '执行部', '物资部', '技术部', '媒体部', '志愿者部',
  '医疗部', '安保部', '财务部', '行政部'
];

// 岗位列表
const positions = [
  '主管', '专员', '协调员', '助理', '组长', '成员'
];

// 姓氏
const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
// 名字
const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英', '华', '平', '刚', '桂英', '志强', '建军', '海燕', '文杰', '雪梅', '佳', '鑫', '浩', '宇'];

function generateName(index) {
  const surname = surnames[index % surnames.length];
  const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];
  return surname + givenName;
}

function generateIdNumber(index) {
  // 生成随机身份证号 (18位)
  const areaCodes = ['110101', '310101', '440101', '330101', '510101', '320101', '370101', '420101', '500101'];
  const areaCode = areaCodes[index % areaCodes.length];
  const year = 1970 + (index % 30); // 1970-1999
  const month = String(1 + (index % 12)).padStart(2, '0');
  const day = String(1 + (index % 28)).padStart(2, '0');
  const seq = String(index).padStart(3, '0');
  const checkCode = 'X'; // 简化，实际需要计算
  return `${areaCode}${year}${month}${day}${seq}${checkCode}`;
}

function generatePhone(index) {
  // 生成随机手机号
  const prefixes = ['138', '139', '150', '151', '186', '187', '188', '135', '136', '158'];
  const prefix = prefixes[index % prefixes.length];
  const suffix = String(10000000 + index * 123).slice(0, 8);
  return prefix + suffix;
}

async function createTestTeam() {
  console.log('开始创建测试团队...\n');

  // 检查机构是否存在
  const org = await knex('organizations').where('id', ORG_ID).first();
  if (!org) {
    console.error('机构不存在:', ORG_ID);
    process.exit(1);
  }
  console.log('目标机构:', org.name);

  const members = [];
  const accounts = [];

  for (let i = 1; i <= 30; i++) {
    const employeeCode = `ZA${String(i).padStart(3, '0')}`;
    const employeeName = generateName(i);
    const department = departments[(i - 1) % departments.length];
    const position = positions[(i - 1) % positions.length];
    const idNumber = generateIdNumber(i);
    const contact = generatePhone(i);
    const memberType = i <= 25 ? 'employee' : 'external_support'; // 25名正式员工 + 5名外援
    const externalEngagementType = memberType === 'external_support' ? (i % 2 === 0 ? 'long_term' : 'temporary') : null;

    // 加密敏感字段
    const encryptedId = encryptField(idNumber);
    const encryptedContact = encryptField(contact);

    members.push({
      org_id: ORG_ID,
      employee_code: employeeCode,
      employee_name: employeeName,
      position,
      department,
      member_type: memberType,
      external_engagement_type: externalEngagementType,
      id_number_ciphertext: encryptedId.ciphertext,
      id_number_iv: encryptedId.iv,
      id_number_auth_tag: encryptedId.authTag,
      id_number_last4: encryptedId.last4,
      contact_ciphertext: encryptedContact.ciphertext,
      contact_iv: encryptedContact.iv,
      contact_auth_tag: encryptedContact.authTag,
      contact_last4: encryptedContact.last4,
      status: 'active',
    });

    console.log(`${i}. ${employeeCode} ${employeeName} - ${department} ${position} (${memberType === 'employee' ? '正式员工' : `外援-${externalEngagementType === 'long_term' ? '长期' : '临时'}`})`);
  }

  console.log('\n插入团队成员数据...');
  const insertedMembers = [];

  for (const member of members) {
    const [inserted] = await knex('team_members')
      .insert(member)
      .returning('*');
    insertedMembers.push(inserted);
  }

  console.log(`已插入 ${insertedMembers.length} 名团队成员`);

  // 为正式员工创建用户账号
  console.log('\n为正式员工创建用户账号...');
  const passwordHash = await bcrypt.hash('Test@123456', 10);

  for (const member of insertedMembers.filter(m => m.member_type === 'employee')) {
    const username = `ZA_${member.employee_name}`;
    const email = `za_${member.employee_code}@test.local`;

    const [user] = await knex('users')
      .insert({
        org_id: ORG_ID,
        username,
        email,
        password_hash: passwordHash,
        role: 'user',
        status: 'active',
        must_change_password: false,
        team_member_id: member.id,
        account_source: 'team_member_auto',
      })
      .returning('*');

    // 更新团队成员的 account_user_id
    await knex('team_members')
      .where('id', member.id)
      .update({ account_user_id: user.id });

    accounts.push({
      username,
      email,
      password: 'Test@123456',
      employeeName: member.employee_name,
      employeeCode: member.employee_code,
    });
  }

  console.log(`已创建 ${accounts.length} 个用户账号\n`);

  // 输出账号信息
  console.log('='.repeat(60));
  console.log('创建的用户账号 (密码统一为: Test@123456):');
  console.log('='.repeat(60));
  accounts.forEach((acc, idx) => {
    console.log(`${idx + 1}. ${acc.employeeName} (${acc.employeeCode})`);
    console.log(`   用户名: ${acc.username}`);
    console.log(`   邮箱: ${acc.email}`);
  });

  console.log('\n✅ 测试团队创建完成!');
  console.log(`   - 团队成员: ${insertedMembers.length} 人`);
  console.log(`   - 正式员工账号: ${accounts.length} 个`);
  console.log(`   - 外援成员: ${insertedMembers.filter(m => m.member_type === 'external_support').length} 人 (无账号)`);

  await knex.destroy();
}

createTestTeam().catch(err => {
  console.error('创建失败:', err);
  process.exit(1);
});