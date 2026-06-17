const express = require('express');
const router = express.Router();
const { Task, TASK_STATUS, Op } = require('../models/Task');
const { Guide } = require('../models/Guide');
const { getMonthRange } = require('../utils/timeUtils');

const FOREIGN_LANGUAGES = ['英语', '日语', '韩语', '法语', '德语', '西班牙语', '俄语', '阿拉伯语'];

function isForeignLanguage(lang) {
  return lang !== '中文' && FOREIGN_LANGUAGES.includes(lang);
}

function attachGuideField(tasks) {
  return tasks.map(t => ({
    ...t,
    guide: t.guideId ? Guide.findByPk(t.guideId) : null
  }));
}

function getCompletedTasks(req) {
  const { startDate, endDate } = req.query;
  const dateWhere = {};
  if (startDate && endDate) dateWhere.date = { [Op.between]: [startDate, endDate] };
  else if (startDate) dateWhere.date = { [Op.gte]: startDate };
  else if (endDate) dateWhere.date = { [Op.lte]: endDate };
  return attachGuideField(Task.findAll({ where: { ...dateWhere, status: TASK_STATUS.COMPLETED } }));
}

router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateWhere = {};
    if (startDate && endDate) dateWhere.date = { [Op.between]: [startDate, endDate] };
    else if (startDate) dateWhere.date = { [Op.gte]: startDate };
    else if (endDate) dateWhere.date = { [Op.lte]: endDate };
    const completedTasks = attachGuideField(Task.findAll({ where: { ...dateWhere, status: TASK_STATUS.COMPLETED } }));
    const totalSessions = completedTasks.length;
    const totalMinutes = completedTasks.reduce((sum, t) => sum + (t.durationMinutes || 0), 0);
    const foreignSessions = completedTasks.filter(t => isForeignLanguage(t.language)).length;
    const foreignMinutes = completedTasks.filter(t => isForeignLanguage(t.language)).reduce((s, t) => s + (t.durationMinutes || 0), 0);
    const totalVisitorCount = completedTasks.reduce((s, t) => s + (t.visitorCount || 0), 0);
    const pendingCount = Task.count({ where: { ...dateWhere, status: TASK_STATUS.PENDING } });
    const inProgressCount = Task.count({ where: { ...dateWhere, status: TASK_STATUS.IN_PROGRESS } });
    const assignedCount = Task.findAll({ where: { ...dateWhere, status: { [Op.in]: [TASK_STATUS.ASSIGNED, TASK_STATUS.ACCEPTED] } } }).length;
    res.json({
      success: true,
      data: {
        totalSessions, totalMinutes, totalHours: +(totalMinutes / 60).toFixed(2),
        totalVisitorCount, foreignSessions, foreignMinutes,
        foreignHours: +(foreignMinutes / 60).toFixed(2),
        foreignSessionRatio: totalSessions > 0 ? +(foreignSessions / totalSessions * 100).toFixed(2) : 0,
        foreignMinuteRatio: totalMinutes > 0 ? +(foreignMinutes / totalMinutes * 100).toFixed(2) : 0,
        pendingCount, inProgressCount, assignedCount
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/by-guide', async (req, res) => {
  try {
    const { startDate, endDate, guideId } = req.query;
    const dateWhere = {};
    if (startDate && endDate) dateWhere.date = { [Op.between]: [startDate, endDate] };
    else if (startDate) dateWhere.date = { [Op.gte]: startDate };
    else if (endDate) dateWhere.date = { [Op.lte]: endDate };
    const taskWhere = { ...dateWhere, status: TASK_STATUS.COMPLETED };
    if (guideId) taskWhere.guideId = guideId;
    const tasks = attachGuideField(Task.findAll({ where: taskWhere }));
    const guideMap = {};
    for (const task of tasks) {
      if (!task.guideId) continue;
      if (!guideMap[task.guideId]) {
        const g = task.guide;
        guideMap[task.guideId] = {
          guideId: task.guideId,
          guideName: g ? g.name : '未知',
          employeeNo: g ? g.employeeNo : '',
          level: g ? g.level : '',
          totalSessions: 0, totalMinutes: 0, foreignSessions: 0, foreignMinutes: 0, totalVisitorCount: 0
        };
      }
      const e = guideMap[task.guideId];
      e.totalSessions++;
      e.totalMinutes += task.durationMinutes || 0;
      e.totalVisitorCount += task.visitorCount || 0;
      if (isForeignLanguage(task.language)) {
        e.foreignSessions++;
        e.foreignMinutes += task.durationMinutes || 0;
      }
    }
    const result = Object.values(guideMap).map(g => ({
      ...g,
      totalHours: +(g.totalMinutes / 60).toFixed(2),
      foreignHours: +(g.foreignMinutes / 60).toFixed(2),
      foreignSessionRatio: g.totalSessions > 0 ? +(g.foreignSessions / g.totalSessions * 100).toFixed(2) : 0,
      foreignMinuteRatio: g.totalMinutes > 0 ? +(g.foreignMinutes / g.totalMinutes * 100).toFixed(2) : 0
    }));
    result.sort((a, b) => b.totalSessions - a.totalSessions);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/by-language', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateWhere = {};
    if (startDate && endDate) dateWhere.date = { [Op.between]: [startDate, endDate] };
    else if (startDate) dateWhere.date = { [Op.gte]: startDate };
    else if (endDate) dateWhere.date = { [Op.lte]: endDate };
    const tasks = Task.findAll({ where: { ...dateWhere, status: TASK_STATUS.COMPLETED } });
    const langMap = {};
    for (const task of tasks) {
      const lang = task.language;
      if (!langMap[lang]) {
        langMap[lang] = {
          language: lang, isForeign: isForeignLanguage(lang),
          totalSessions: 0, totalMinutes: 0, totalVisitorCount: 0, guideIds: new Set()
        };
      }
      const e = langMap[lang];
      e.totalSessions++;
      e.totalMinutes += task.durationMinutes || 0;
      e.totalVisitorCount += task.visitorCount || 0;
      if (task.guideId) e.guideIds.add(task.guideId);
    }
    const totalSessionsAll = tasks.length;
    const totalMinutesAll = tasks.reduce((s, t) => s + (t.durationMinutes || 0), 0);
    const result = Object.values(langMap).map(l => ({
      language: l.language, isForeign: l.isForeign,
      totalSessions: l.totalSessions, totalMinutes: l.totalMinutes,
      totalHours: +(l.totalMinutes / 60).toFixed(2),
      totalVisitorCount: l.totalVisitorCount, guideCount: l.guideIds.size,
      sessionRatio: totalSessionsAll > 0 ? +(l.totalSessions / totalSessionsAll * 100).toFixed(2) : 0,
      minuteRatio: totalMinutesAll > 0 ? +(l.totalMinutes / totalMinutesAll * 100).toFixed(2) : 0
    }));
    result.sort((a, b) => b.totalSessions - a.totalSessions);
    res.json({
      success: true, data: result,
      summary: {
        totalSessions: totalSessionsAll,
        totalMinutes: totalMinutesAll,
        totalHours: +(totalMinutesAll / 60).toFixed(2)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/by-month', async (req, res) => {
  try {
    let { year } = req.query;
    const now = new Date();
    if (!year) year = now.getFullYear();
    year = parseInt(year);
    const monthlyData = [];
    for (let month = 1; month <= 12; month++) {
      const { start, end } = getMonthRange(year, month);
      const tasks = Task.findAll({ where: { date: { [Op.between]: [start, end] }, status: TASK_STATUS.COMPLETED } });
      const totalSessions = tasks.length;
      const totalMinutes = tasks.reduce((s, t) => s + (t.durationMinutes || 0), 0);
      const foreignSessions = tasks.filter(t => isForeignLanguage(t.language)).length;
      const foreignMinutes = tasks.filter(t => isForeignLanguage(t.language)).reduce((s, t) => s + (t.durationMinutes || 0), 0);
      const totalVisitorCount = tasks.reduce((s, t) => s + (t.visitorCount || 0), 0);
      const uniqueGuideCount = new Set(tasks.map(t => t.guideId).filter(Boolean)).size;
      monthlyData.push({
        year, month, monthLabel: `${year}年${month}月`,
        totalSessions, totalMinutes, totalHours: +(totalMinutes / 60).toFixed(2),
        foreignSessions, foreignMinutes, foreignHours: +(foreignMinutes / 60).toFixed(2),
        foreignSessionRatio: totalSessions > 0 ? +(foreignSessions / totalSessions * 100).toFixed(2) : 0,
        foreignMinuteRatio: totalMinutes > 0 ? +(foreignMinutes / totalMinutes * 100).toFixed(2) : 0,
        totalVisitorCount, guideCount: uniqueGuideCount
      });
    }
    const yearSummary = monthlyData.reduce((acc, m) => ({
      totalSessions: acc.totalSessions + m.totalSessions,
      totalMinutes: acc.totalMinutes + m.totalMinutes,
      foreignSessions: acc.foreignSessions + m.foreignSessions,
      foreignMinutes: acc.foreignMinutes + m.foreignMinutes,
      totalVisitorCount: acc.totalVisitorCount + m.totalVisitorCount
    }), { totalSessions: 0, totalMinutes: 0, foreignSessions: 0, foreignMinutes: 0, totalVisitorCount: 0 });
    res.json({
      success: true, year, data: monthlyData,
      yearSummary: {
        ...yearSummary,
        totalHours: +(yearSummary.totalMinutes / 60).toFixed(2),
        foreignHours: +(yearSummary.foreignMinutes / 60).toFixed(2),
        foreignSessionRatio: yearSummary.totalSessions > 0
          ? +(yearSummary.foreignSessions / yearSummary.totalSessions * 100).toFixed(2) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/guide/:guideId', async (req, res) => {
  try {
    const { guideId } = req.params;
    const { startDate, endDate } = req.query;
    const dateWhere = {};
    if (startDate && endDate) dateWhere.date = { [Op.between]: [startDate, endDate] };
    else if (startDate) dateWhere.date = { [Op.gte]: startDate };
    else if (endDate) dateWhere.date = { [Op.lte]: endDate };
    const guide = Guide.findByPk(guideId);
    if (!guide) return res.status(404).json({ success: false, message: '讲解员不存在' });
    const tasks = Task.findAll({ where: { ...dateWhere, guideId, status: TASK_STATUS.COMPLETED } });
    const totalSessions = tasks.length;
    const totalMinutes = tasks.reduce((s, t) => s + (t.durationMinutes || 0), 0);
    const foreignSessions = tasks.filter(t => isForeignLanguage(t.language)).length;
    const foreignMinutes = tasks.filter(t => isForeignLanguage(t.language)).reduce((s, t) => s + (t.durationMinutes || 0), 0);
    const totalVisitorCount = tasks.reduce((s, t) => s + (t.visitorCount || 0), 0);
    const themeMap = {};
    const hallMap = {};
    for (const t of tasks) {
      themeMap[t.theme] = (themeMap[t.theme] || 0) + 1;
      if (t.hall) hallMap[t.hall] = (hallMap[t.hall] || 0) + 1;
    }
    res.json({
      success: true,
      data: {
        guide: { id: guide.id, name: guide.name, employeeNo: guide.employeeNo, level: guide.level },
        totalSessions, totalMinutes, totalHours: +(totalMinutes / 60).toFixed(2),
        foreignSessions, foreignMinutes, foreignHours: +(foreignMinutes / 60).toFixed(2),
        foreignSessionRatio: totalSessions > 0 ? +(foreignSessions / totalSessions * 100).toFixed(2) : 0,
        totalVisitorCount,
        themeBreakdown: Object.entries(themeMap).map(([theme, count]) => ({ theme, count })),
        hallBreakdown: Object.entries(hallMap).map(([hall, count]) => ({ hall, count }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
