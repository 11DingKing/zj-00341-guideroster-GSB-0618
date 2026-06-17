const db = require('../config/database');
const { Guide } = require('../models/Guide');
const { Schedule } = require('../models/Schedule');
const { Task, TASK_STATUS, TASK_TYPE } = require('../models/Task');
const { Reassignment } = require('../models/Reassignment');
const { calculateDurationMinutes } = require('../utils/timeUtils');

const HALLS = ['第一展厅（序厅）', '第二展厅（革命历史）', '第三展厅（英雄人物）', '第四展厅（文物珍藏）', '第五展厅（精神传承）'];

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function seed() {
  console.log('清空数据库并重置计数器...');
  db.setState({
    guides: [], schedules: [], tasks: [], reassignments: [],
    counters: { guideId: 0, scheduleId: 0, taskId: 0, reassignmentId: 0 }
  }).write();
  console.log('数据库已重置');

  console.log('创建讲解员档案...');
  const guides = Guide.bulkCreate([
    {
      name: '石琳', employeeNo: 'G2019001', level: 'expert',
      languages: ['中文', '英语', '日语'],
      themes: ['光辉历程', '英雄事迹', '红色精神', '开学第一课', '党史教育'],
      phone: '13800000001', status: 'active'
    },
    {
      name: '王志远', employeeNo: 'G2020015', level: 'senior',
      languages: ['中文', '英语'],
      themes: ['光辉历程', '文物故事', '党史教育'],
      phone: '13800000002', status: 'active'
    },
    {
      name: '刘雪梅', employeeNo: 'G2021008', level: 'intermediate',
      languages: ['中文', '韩语'],
      themes: ['英雄事迹', '红色精神', '开学第一课'],
      phone: '13800000003', status: 'active'
    },
    {
      name: '张浩然', employeeNo: 'G2022023', level: 'intermediate',
      languages: ['中文', '法语', '英语'],
      themes: ['光辉历程', '文物故事', '红色精神'],
      phone: '13800000004', status: 'active'
    },
    {
      name: '陈思雨', employeeNo: 'G2023012', level: 'junior',
      languages: ['中文', '日语'],
      themes: ['英雄事迹', '开学第一课'],
      phone: '13800000005', status: 'active'
    },
    {
      name: '李明辉', employeeNo: 'G2023045', level: 'junior',
      languages: ['中文'],
      themes: ['光辉历程', '党史教育', '开学第一课'],
      phone: '13800000006', status: 'active'
    }
  ]);
  console.log(`已创建 ${guides.length} 名讲解员`);

  const today = new Date();
  const dates = [];
  for (let i = -2; i <= 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(formatDate(d));
  }

  console.log('创建排班数据...');
  const schedulesData = [];
  const shiftTemplates = [
    { startTime: '08:30', endTime: '12:00', shiftType: 'morning' },
    { startTime: '13:30', endTime: '17:00', shiftType: 'afternoon' },
    { startTime: '08:30', endTime: '17:00', shiftType: 'full' }
  ];
  for (const date of dates) {
    for (let i = 0; i < guides.length; i++) {
      const dow = new Date(date).getDay();
      if (dow === 0 && (i === 2 || i === 5)) continue;
      if (dow === 6 && (i === 0 || i === 3)) continue;
      const tplIdx = (i + dates.indexOf(date)) % shiftTemplates.length;
      const tpl = shiftTemplates[tplIdx];
      const hallIdx = (i + dates.indexOf(date)) % HALLS.length;
      schedulesData.push({
        guideId: guides[i].id, date,
        startTime: tpl.startTime, endTime: tpl.endTime,
        hall: HALLS[hallIdx], shiftType: tpl.shiftType, remark: ''
      });
    }
  }
  Schedule.bulkCreate(schedulesData);
  console.log(`已创建 ${schedulesData.length} 条排班 (覆盖 ${dates.length} 天)`);

  console.log('创建讲解任务...');
  const taskTemplates = [
    { taskType: TASK_TYPE.NORMAL, groupName: '北京市第三中学初二参观团', visitorCount: 45,
      language: '中文', theme: '开学第一课', hall: HALLS[1],
      dateOffset: 0, startTime: '09:00', endTime: '10:30',
      status: TASK_STATUS.COMPLETED, guideIdx: 0,
      contactPerson: '王老师', contactPhone: '13900001001' },
    { taskType: TASK_TYPE.FOREIGN, groupName: '美国哈佛大学东亚研究代表团', visitorCount: 12,
      language: '英语', theme: '光辉历程', hall: HALLS[0],
      dateOffset: 0, startTime: '14:00', endTime: '16:00',
      status: TASK_STATUS.COMPLETED, guideIdx: 0,
      contactPerson: 'Prof. Smith', contactPhone: '13900001002', actualDuration: 125 },
    { taskType: TASK_TYPE.STUDENT, groupName: '清华附小五年级爱国主义教育', visitorCount: 60,
      language: '中文', theme: '英雄事迹', hall: HALLS[2],
      dateOffset: 0, startTime: '10:00', endTime: '11:30',
      status: TASK_STATUS.COMPLETED, guideIdx: 2,
      contactPerson: '李老师', contactPhone: '13900001003' },
    { taskType: TASK_TYPE.VIP, groupName: '某省党史学习考察团', visitorCount: 25,
      language: '中文', theme: '党史教育', hall: HALLS[4],
      dateOffset: 0, startTime: '15:00', endTime: '17:00',
      status: TASK_STATUS.IN_PROGRESS, guideIdx: 1,
      contactPerson: '张主任', contactPhone: '13900001004' },
    { taskType: TASK_TYPE.NORMAL, groupName: '上海某企业党支部学习', visitorCount: 30,
      language: '中文', theme: '红色精神', hall: HALLS[0],
      dateOffset: 1, startTime: '09:30', endTime: '11:00',
      status: TASK_STATUS.ACCEPTED, guideIdx: 3,
      contactPerson: '赵书记', contactPhone: '13900001005' },
    { taskType: TASK_TYPE.FOREIGN, groupName: '日本京都大学历史学部交流团', visitorCount: 8,
      language: '日语', theme: '文物故事', hall: HALLS[3],
      dateOffset: 1, startTime: '13:30', endTime: '15:30',
      status: TASK_STATUS.ASSIGNED, guideIdx: 0,
      contactPerson: '田中教授', contactPhone: '13900001006',
      specialRequirements: '需准备日文资料' },
    { taskType: TASK_TYPE.FOREIGN, groupName: '韩国文化交流访问团', visitorCount: 15,
      language: '韩语', theme: '英雄事迹', hall: HALLS[2],
      dateOffset: 1, startTime: '10:00', endTime: '12:00',
      status: TASK_STATUS.REASSIGNED, guideIdx: 2,
      contactPerson: '金秘书', contactPhone: '13900001007',
      makeReassign: true },
    { taskType: TASK_TYPE.NORMAL, groupName: '某军区老干部参观团', visitorCount: 20,
      language: '中文', theme: '光辉历程', hall: HALLS[1],
      dateOffset: 2, startTime: '09:00', endTime: '11:00',
      status: TASK_STATUS.PENDING, guideIdx: -1,
      contactPerson: '陈参谋', contactPhone: '13900001008' },
    { taskType: TASK_TYPE.STUDENT, groupName: '北京大学马克思主义学院研学', visitorCount: 35,
      language: '中文', theme: '党史教育', hall: HALLS[4],
      dateOffset: 2, startTime: '14:00', endTime: '16:30',
      status: TASK_STATUS.PENDING, guideIdx: -1,
      contactPerson: '孙教授', contactPhone: '13900001009' },
    { taskType: TASK_TYPE.FOREIGN, groupName: '法国索邦大学汉学系访问团', visitorCount: 6,
      language: '法语', theme: '文物故事', hall: HALLS[3],
      dateOffset: 3, startTime: '10:00', endTime: '12:00',
      status: TASK_STATUS.PENDING, guideIdx: -1,
      contactPerson: 'Dubois 教授', contactPhone: '13900001010',
      specialRequirements: '法语讲解，需准备中法对照材料' },
    { taskType: TASK_TYPE.VIP, groupName: '外交部外事接待任务', visitorCount: 10,
      language: '英语', theme: '光辉历程', hall: HALLS[0],
      dateOffset: 4, startTime: '15:00', endTime: '17:00',
      status: TASK_STATUS.PENDING, guideIdx: -1,
      contactPerson: '刘处长', contactPhone: '13900001011',
      specialRequirements: 'VIP接待，需高级别讲解员' },
    { taskType: TASK_TYPE.NORMAL, groupName: '某社区党支部参观', visitorCount: 28,
      language: '中文', theme: '红色精神', hall: HALLS[4],
      dateOffset: -1, startTime: '14:00', endTime: '15:30',
      status: TASK_STATUS.COMPLETED, guideIdx: 5,
      contactPerson: '周书记', contactPhone: '13900001012' },
    { taskType: TASK_TYPE.STUDENT, groupName: '某中学高一年级开学第一课', visitorCount: 120,
      language: '中文', theme: '开学第一课', hall: HALLS[1],
      dateOffset: -1, startTime: '09:00', endTime: '10:30',
      status: TASK_STATUS.COMPLETED, guideIdx: 4,
      contactPerson: '吴主任', contactPhone: '13900001013' },
    { taskType: TASK_TYPE.FOREIGN, groupName: '德国海德堡大学哲学系交流', visitorCount: 5,
      language: '英语', theme: '红色精神', hall: HALLS[4],
      dateOffset: -2, startTime: '10:00', endTime: '12:00',
      status: TASK_STATUS.COMPLETED, guideIdx: 1,
      contactPerson: 'Müller 博士', contactPhone: '13900001014',
      actualDuration: 130 }
  ];

  const tasks = [];
  let seq = 1000;
  for (const tpl of taskTemplates) {
    const d = new Date(today);
    d.setDate(today.getDate() + tpl.dateOffset);
    const dateStr = formatDate(d);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    seq++;
    const taskNo = `T${y}${m}${day}${seq}`;
    const guideId = tpl.guideIdx >= 0 ? guides[tpl.guideIdx].id : null;
    const completedAt = tpl.status === TASK_STATUS.COMPLETED ? new Date(d).toISOString() : null;
    const duration = tpl.actualDuration || calculateDurationMinutes(tpl.startTime, tpl.endTime);
    const task = Task.create({
      taskNo, taskType: tpl.taskType, groupName: tpl.groupName,
      visitorCount: tpl.visitorCount, language: tpl.language,
      theme: tpl.theme, hall: tpl.hall, date: dateStr,
      startTime: tpl.startTime, endTime: tpl.endTime,
      status: tpl.status, guideId, durationMinutes: duration,
      contactPerson: tpl.contactPerson, contactPhone: tpl.contactPhone,
      specialRequirements: tpl.specialRequirements || '',
      completedAt
    });
    tasks.push(task);
    if (tpl.makeReassign && tpl.guideIdx >= 0) {
      Reassignment.create({
        taskId: task.id, fromGuideId: guideId, toGuideId: null,
        reason: '讲解员临时身体不适，医生建议休息，无法承担明日的韩国团接待任务，请求改派',
        status: 'pending', approvedBy: null, approvedAt: null,
        applicantName: guides[tpl.guideIdx].name
      });
    }
  }
  console.log(`已创建 ${tasks.length} 条讲解任务`);

  console.log('\n=== 种子数据创建完成 ===');
  console.log(`讲解员: ${guides.length} 名`);
  console.log(`排班记录: ${schedulesData.length} 条 (覆盖 ${dates.length} 天)`);
  console.log(`讲解任务: ${tasks.length} 条`);
  console.log('  - 待分派:', tasks.filter(t => t.status === TASK_STATUS.PENDING).length);
  console.log('  - 已派单(待接):', tasks.filter(t => t.status === TASK_STATUS.ASSIGNED).length);
  console.log('  - 已接单:', tasks.filter(t => t.status === TASK_STATUS.ACCEPTED).length);
  console.log('  - 讲解中:', tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length);
  console.log('  - 已完成:', tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length);
  console.log('  - 已改派(待处理):', tasks.filter(t => t.status === TASK_STATUS.REASSIGNED).length);

  process.exit(0);
}

seed().catch(err => {
  console.error('种子数据创建失败:', err);
  process.exit(1);
});
