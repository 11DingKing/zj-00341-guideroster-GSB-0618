const express = require('express');
const router = express.Router();
const { Guide, Op } = require('../models/Guide');

router.get('/', async (req, res) => {
  try {
    const { status, level, language, theme, keyword } = req.query;
    const where = {};
    if (status) where.status = status;
    if (level) where.level = level;
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { employeeNo: { [Op.like]: `%${keyword}%` } }
      ];
    }
    let guides = Guide.findAll({ where, order: [['id', 'ASC']] });
    if (language) {
      guides = guides.filter(g => g.languages && g.languages.includes(language));
    }
    if (theme) {
      guides = guides.filter(g => g.themes && g.themes.includes(theme));
    }
    res.json({ success: true, data: guides });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const guide = Guide.findByPk(req.params.id);
    if (!guide) {
      return res.status(404).json({ success: false, message: '讲解员不存在' });
    }
    res.json({ success: true, data: guide });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, employeeNo, level, languages, themes, phone, status } = req.body;
    if (!name || !employeeNo) {
      return res.status(400).json({ success: false, message: '姓名和工号必填' });
    }
    const existing = Guide.findOne({ where: { employeeNo } });
    if (existing) {
      return res.status(400).json({ success: false, message: '工号已存在' });
    }
    const guide = Guide.create({
      name, employeeNo,
      level: level || 'junior',
      languages: languages || ['中文'],
      themes: themes || [],
      phone: phone || '',
      status: status || 'active'
    });
    res.json({ success: true, data: guide, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const guide = Guide.findByPk(req.params.id);
    if (!guide) {
      return res.status(404).json({ success: false, message: '讲解员不存在' });
    }
    const { name, employeeNo, level, languages, themes, phone, status } = req.body;
    if (employeeNo && employeeNo !== guide.employeeNo) {
      const existing = Guide.findOne({ where: { employeeNo } });
      if (existing) {
        return res.status(400).json({ success: false, message: '工号已存在' });
      }
    }
    const updated = Guide.update(guide.id, {
      name: name || guide.name,
      employeeNo: employeeNo || guide.employeeNo,
      level: level || guide.level,
      languages: languages || guide.languages,
      themes: themes || guide.themes,
      phone: phone !== undefined ? phone : guide.phone,
      status: status || guide.status
    });
    res.json({ success: true, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const guide = Guide.findByPk(req.params.id);
    if (!guide) {
      return res.status(404).json({ success: false, message: '讲解员不存在' });
    }
    Guide.destroy(guide.id);
    res.json({ success: true, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
