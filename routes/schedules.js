const express = require('express');
const router = express.Router();
const { Schedule, Op } = require('../models/Schedule');
const { Guide } = require('../models/Guide');
const { checkTimeConflict } = require('../utils/timeUtils');
const { pick } = require('../models/dbHelper');

function attachGuide(list) {
  return list.map(s => {
    const g = s.guideId ? Guide.findByPk(s.guideId) : null;
    return {
      ...s,
      guide: g ? pick(g, ['id', 'name', 'employeeNo', 'level']) : null
    };
  });
}

async function hasScheduleConflict(guideId, date, startTime, endTime, excludeId = null) {
  const where = { guideId, date };
  const existing = Schedule.findAll({ where });
  for (const s of existing) {
    if (excludeId && s.id === excludeId) continue;
    if (checkTimeConflict(startTime, endTime, s.startTime, s.endTime)) {
      return s;
    }
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const { date, guideId, startDate, endDate, hall } = req.query;
    const where = {};
    if (date) where.date = date;
    if (guideId) where.guideId = guideId;
    if (hall) where.hall = hall;
    if (startDate && endDate) where.date = { [Op.between]: [startDate, endDate] };
    else if (startDate) where.date = { [Op.gte]: startDate };
    else if (endDate) where.date = { [Op.lte]: endDate };
    const schedules = Schedule.findAll({ where, order: [['date', 'ASC'], ['startTime', 'ASC']] });
    res.json({ success: true, data: attachGuide(schedules) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const schedule = Schedule.findByPk(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: '排班记录不存在' });
    }
    res.json({ success: true, data: attachGuide([schedule])[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { guideId, date, startTime, endTime, hall, shiftType, remark } = req.body;
    if (!guideId || !date || !startTime || !endTime || !hall) {
      return res.status(400).json({ success: false, message: '讲解员、日期、时间、展厅必填' });
    }
    const guide = Guide.findByPk(guideId);
    if (!guide) return res.status(400).json({ success: false, message: '讲解员不存在' });
    const conflict = await hasScheduleConflict(guideId, date, startTime, endTime);
    if (conflict) {
      return res.status(400).json({
        success: false,
        message: `时段冲突：该讲解员在 ${conflict.startTime}-${conflict.endTime} 已有排班（${conflict.hall}）`
      });
    }
    const schedule = Schedule.create({
      guideId, date, startTime, endTime, hall,
      shiftType: shiftType || 'custom', remark: remark || ''
    });
    res.json({ success: true, data: schedule, message: '排班成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/batch', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: '请提供排班数据' });
    }
    const results = [];
    const errors = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { guideId, date, startTime, endTime, hall, shiftType, remark } = item;
      if (!guideId || !date || !startTime || !endTime || !hall) {
        errors.push({ index: i, message: '缺少必填字段' });
        continue;
      }
      if (!Guide.findByPk(guideId)) {
        errors.push({ index: i, message: '讲解员不存在' });
        continue;
      }
      const conflict = await hasScheduleConflict(guideId, date, startTime, endTime);
      if (conflict) {
        errors.push({ index: i, message: `时段冲突：${conflict.startTime}-${conflict.endTime} ${conflict.hall}` });
        continue;
      }
      results.push(Schedule.create({
        guideId, date, startTime, endTime, hall,
        shiftType: shiftType || 'custom', remark: remark || ''
      }));
    }
    res.json({
      success: errors.length === 0,
      data: results, errors,
      message: `成功创建 ${results.length} 条排班，失败 ${errors.length} 条`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const schedule = Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: '排班记录不存在' });
    const { guideId, date, startTime, endTime, hall, shiftType, remark } = req.body;
    const gid = guideId || schedule.guideId;
    const d = date || schedule.date;
    const st = startTime || schedule.startTime;
    const et = endTime || schedule.endTime;
    const conflict = await hasScheduleConflict(gid, d, st, et, schedule.id);
    if (conflict) {
      return res.status(400).json({
        success: false,
        message: `时段冲突：该讲解员在 ${conflict.startTime}-${conflict.endTime} 已有排班（${conflict.hall}）`
      });
    }
    const updated = Schedule.update(schedule.id, {
      guideId: gid, date: d, startTime: st, endTime: et,
      hall: hall || schedule.hall,
      shiftType: shiftType || schedule.shiftType,
      remark: remark !== undefined ? remark : schedule.remark
    });
    res.json({ success: true, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const schedule = Schedule.findByPk(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: '排班记录不存在' });
    Schedule.destroy(schedule.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
