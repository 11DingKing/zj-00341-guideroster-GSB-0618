const express = require('express');
const router = express.Router();
const { Task, TASK_STATUS, TASK_TYPE, Op } = require('../models/Task');
const { Guide } = require('../models/Guide');
const { Schedule } = require('../models/Schedule');
const { Reassignment } = require('../models/Reassignment');
const { checkTimeConflict, generateTaskNo, calculateDurationMinutes } = require('../utils/timeUtils');
const { pick } = require('../models/dbHelper');

function attachGuide(list, attrs = null) {
  return list.map(t => {
    const g = t.guideId ? Guide.findByPk(t.guideId) : null;
    return { ...t, guide: g ? (attrs ? pick(g, attrs) : g) : null };
  });
}

async function findSuitableGuides(language, theme, date, startTime, endTime, hall = null, excludeGuideId = null) {
  let guides = Guide.findAll({ where: { status: 'active' } });
  guides = guides.filter(g => g.languages && g.languages.includes(language));
  guides = guides.filter(g => g.themes && g.themes.includes(theme));
  if (excludeGuideId) guides = guides.filter(g => g.id !== excludeGuideId);
  const results = [];
  for (const guide of guides) {
    const sConflict = await hasScheduleConflict(guide.id, date, startTime, endTime);
    if (sConflict) continue;
    const tConflict = await hasTaskConflict(guide.id, date, startTime, endTime);
    if (tConflict) continue;
    if (hall) {
      const inHall = Schedule.findAll({ where: { guideId: guide.id, date, hall } });
      if (!inHall || inHall.length === 0) continue;
    }
    results.push(guide);
  }
  const levelOrder = { expert: 0, senior: 1, intermediate: 2, junior: 3 };
  results.sort((a, b) => (levelOrder[a.level] || 9) - (levelOrder[b.level] || 9));
  return results;
}

async function hasScheduleConflict(guideId, date, startTime, endTime, excludeId = null) {
  const existing = Schedule.findAll({ where: { guideId, date } });
  for (const s of existing) {
    if (excludeId && s.id === excludeId) continue;
    if (checkTimeConflict(startTime, endTime, s.startTime, s.endTime)) return s;
  }
  return null;
}

async function hasTaskConflict(guideId, date, startTime, endTime, excludeTaskId = null) {
  const tasks = Task.findAll({
    where: {
      guideId, date,
      status: { [Op.in]: [TASK_STATUS.ASSIGNED, TASK_STATUS.ACCEPTED, TASK_STATUS.IN_PROGRESS] }
    }
  });
  for (const t of tasks) {
    if (excludeTaskId && t.id === excludeTaskId) continue;
    if (checkTimeConflict(startTime, endTime, t.startTime, t.endTime)) return t;
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const { status, guideId, date, startDate, endDate, taskType, language, theme } = req.query;
    const where = {};
    if (status) where.status = status;
    if (guideId) where.guideId = guideId;
    if (taskType) where.taskType = taskType;
    if (language) where.language = language;
    if (theme) where.theme = theme;
    if (date) where.date = date;
    if (startDate && endDate) where.date = { [Op.between]: [startDate, endDate] };
    const tasks = Task.findAll({ where, order: [['date', 'DESC'], ['startTime', 'DESC']] });
    res.json({ success: true, data: attachGuide(tasks, ['id', 'name', 'employeeNo', 'level', 'languages']) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    const g = task.guideId ? Guide.findByPk(task.guideId) : null;
    const reassignments = Reassignment.findAll({ where: { taskId: task.id }, order: [['createdAt', 'DESC']] })
      .map(r => ({
        ...r,
        fromGuide: r.fromGuideId ? pick(Guide.findByPk(r.fromGuideId), ['id', 'name']) : null,
        toGuide: r.toGuideId ? pick(Guide.findByPk(r.toGuideId), ['id', 'name']) : null
      }));
    res.json({
      success: true,
      data: {
        ...task,
        guide: g ? pick(g, ['id', 'name', 'employeeNo', 'level', 'languages', 'themes']) : null,
        reassignments
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/match-guides', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    const guides = await findSuitableGuides(task.language, task.theme, task.date, task.startTime, task.endTime, task.hall);
    res.json({ success: true, data: guides, count: guides.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/match-guides', async (req, res) => {
  try {
    const { language, theme, date, startTime, endTime, hall } = req.body;
    if (!language || !theme || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: '语种、主题、日期、时段必填' });
    }
    const guides = await findSuitableGuides(language, theme, date, startTime, endTime, hall);
    res.json({ success: true, data: guides, count: guides.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      taskType, groupName, visitorCount, language, theme, hall,
      date, startTime, endTime, contactPerson, contactPhone, specialRequirements
    } = req.body;
    if (!groupName || !language || !theme || !date || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: '团名、语种、主题、日期、时段必填' });
    }
    const taskNo = generateTaskNo();
    const task = Task.create({
      taskNo, taskType: taskType || TASK_TYPE.NORMAL, groupName,
      visitorCount: visitorCount || 0, language, theme, hall: hall || '',
      date, startTime, endTime, status: TASK_STATUS.PENDING,
      durationMinutes: calculateDurationMinutes(startTime, endTime),
      contactPerson: contactPerson || '', contactPhone: contactPhone || '',
      specialRequirements: specialRequirements || ''
    });
    res.json({ success: true, data: task, message: '需求已创建，状态：待分派' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (![TASK_STATUS.PENDING, TASK_STATUS.REASSIGNED].includes(task.status)) {
      return res.status(400).json({ success: false, message: '当前状态不支持派单' });
    }
    const { guideId } = req.body;
    if (!guideId) return res.status(400).json({ success: false, message: '请指定讲解员' });
    const guide = Guide.findByPk(guideId);
    if (!guide) return res.status(400).json({ success: false, message: '讲解员不存在' });
    if (!guide.languages || !guide.languages.includes(task.language)) {
      return res.status(400).json({
        success: false,
        message: `该讲解员不擅长${task.language}，无法承担${task.language === '中文' ? '' : '外文'}讲解任务`
      });
    }
    if (!guide.themes || !guide.themes.includes(task.theme)) {
      return res.status(400).json({
        success: false,
        message: `该讲解员不支持"${task.theme}"主题线路`
      });
    }
    const tConflict = await hasTaskConflict(guideId, task.date, task.startTime, task.endTime, task.id);
    if (tConflict) {
      return res.status(400).json({
        success: false,
        message: `时段冲突：该讲解员已有任务 [${tConflict.taskNo}] (${tConflict.startTime}-${tConflict.endTime})`
      });
    }
    const updated = Task.update(task.id, { guideId, status: TASK_STATUS.ASSIGNED });
    res.json({ success: true, data: updated, message: `已派单给${guide.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/auto-assign', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (![TASK_STATUS.PENDING, TASK_STATUS.REASSIGNED].includes(task.status)) {
      return res.status(400).json({ success: false, message: '当前状态不支持自动派单' });
    }
    const excludeGuideId = task.status === TASK_STATUS.REASSIGNED ? task.guideId : null;
    const guides = await findSuitableGuides(
      task.language, task.theme, task.date, task.startTime, task.endTime, task.hall, excludeGuideId
    );
    if (guides.length === 0) {
      return res.status(400).json({
        success: false,
        message: '未找到符合条件的讲解员（语种/主题/时段不匹配）'
      });
    }
    const chosen = guides[0];
    const updated = Task.update(task.id, { guideId: chosen.id, status: TASK_STATUS.ASSIGNED });
    res.json({
      success: true, data: updated, matchedGuide: chosen,
      totalCandidates: guides.length,
      message: `自动派单给${chosen.name}（共${guides.length}名候选人）`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/accept', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status !== TASK_STATUS.ASSIGNED) {
      return res.status(400).json({ success: false, message: '当前状态不支持接单' });
    }
    const updated = Task.update(task.id, { status: TASK_STATUS.ACCEPTED });
    res.json({ success: true, data: updated, message: '已接单' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status !== TASK_STATUS.ACCEPTED) {
      return res.status(400).json({ success: false, message: '当前状态不支持开始讲解' });
    }
    const updated = Task.update(task.id, { status: TASK_STATUS.IN_PROGRESS });
    res.json({ success: true, data: updated, message: '讲解中' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: '当前状态不支持完成' });
    }
    const { actualDuration } = req.body;
    const updated = Task.update(task.id, {
      status: TASK_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      durationMinutes: actualDuration || task.durationMinutes
    });
    res.json({ success: true, data: updated, message: '已完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/reassign-request', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (![TASK_STATUS.ASSIGNED, TASK_STATUS.ACCEPTED].includes(task.status)) {
      return res.status(400).json({ success: false, message: '当前状态不支持申请改派' });
    }
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: '请填写改派原因' });
    const guide = Guide.findByPk(task.guideId);
    const reassignment = Reassignment.create({
      taskId: task.id, fromGuideId: task.guideId, toGuideId: null,
      reason, status: 'pending', approvedBy: null, approvedAt: null,
      applicantName: guide ? guide.name : ''
    });
    const updated = Task.update(task.id, { status: TASK_STATUS.REASSIGNED });
    res.json({ success: true, data: { task: updated, reassignment }, message: '已提交改派申请' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/:id/reassign', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status !== TASK_STATUS.REASSIGNED) {
      return res.status(400).json({ success: false, message: '请先申请改派' });
    }
    const { guideId, approvedBy } = req.body;
    if (!guideId) return res.status(400).json({ success: false, message: '请指定新讲解员' });
    const guide = Guide.findByPk(guideId);
    if (!guide) return res.status(400).json({ success: false, message: '新讲解员不存在' });
    if (!guide.languages || !guide.languages.includes(task.language)) {
      return res.status(400).json({ success: false, message: `新讲解员不擅长${task.language}` });
    }
    if (!guide.themes || !guide.themes.includes(task.theme)) {
      return res.status(400).json({ success: false, message: `新讲解员不支持"${task.theme}"主题` });
    }
    const tConflict = await hasTaskConflict(guideId, task.date, task.startTime, task.endTime, task.id);
    if (tConflict) {
      return res.status(400).json({
        success: false, message: `新讲解员时段冲突：已有任务 [${tConflict.taskNo}]`
      });
    }
    const oldGuideId = task.guideId;
    const updated = Task.update(task.id, { guideId, status: TASK_STATUS.ASSIGNED });
    const pendingList = Reassignment.findAll({ where: { taskId: task.id, status: 'pending' }, order: [['createdAt', 'DESC']] });
    if (pendingList && pendingList.length > 0) {
      Reassignment.update(pendingList[0].id, {
        toGuideId: guideId, status: 'reassigned',
        approvedBy: approvedBy || 'system', approvedAt: new Date().toISOString()
      });
    }
    res.json({ success: true, data: updated, message: `已改派给${guide.name}（原讲解员ID:${oldGuideId}）` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if ([TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED].includes(task.status)) {
      return res.status(400).json({ success: false, message: '进行中或已完成的任务不可修改' });
    }
    const allowed = ['groupName', 'visitorCount', 'language', 'theme', 'hall',
      'date', 'startTime', 'endTime', 'contactPerson', 'contactPhone',
      'specialRequirements', 'taskType'];
    const patch = {};
    for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
    if (patch.startTime || patch.endTime) {
      const st = patch.startTime || task.startTime;
      const et = patch.endTime || task.endTime;
      patch.durationMinutes = calculateDurationMinutes(st, et);
    }
    const updated = Task.update(task.id, patch);
    res.json({ success: true, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const task = Task.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: '任务不存在' });
    if (task.status === TASK_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: '进行中的任务不可删除' });
    }
    Task.destroy(task.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
