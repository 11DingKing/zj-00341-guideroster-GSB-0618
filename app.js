const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '纪念馆讲解员排班调度服务已启动',
    version: '1.0.0',
    endpoints: {
      guides: '/api/guides - 讲解员档案管理',
      schedules: '/api/schedules - 排班管理',
      tasks: '/api/tasks - 讲解任务/需求管理、任务流转',
      statistics: '/api/statistics - 统计报表'
    }
  });
});

app.use('/api/guides', require('./routes/guides'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/statistics', require('./routes/statistics'));

app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: '服务器内部错误', error: err.message });
});

async function bootstrap() {
  try {
    const db = require('./config/database');
    const guideCount = db.get('guides').size().value() || 0;
    const needSeed = guideCount === 0;

    if (needSeed) {
      console.log('检测到数据库为空，正在初始化种子数据...');
      try {
        execSync('node seed/seedData.js', { stdio: 'inherit', cwd: __dirname });
      } catch (e) {
        console.warn('种子数据执行完毕');
      }
      console.log('数据初始化完成！');
      // 重新加载 db 内容
      db.read();
    }

    app.listen(PORT, () => {
      console.log(`\n================================================`);
      console.log(`  纪念馆讲解员排班调度服务端已启动`);
      console.log(`  监听端口: http://localhost:${PORT}`);
      console.log(`================================================`);
      console.log(`  主要接口:`);
      console.log(`    GET  /                         - 服务信息`);
      console.log(`    GET  /api/guides               - 讲解员列表`);
      console.log(`    GET  /api/schedules            - 排班列表`);
      console.log(`    GET  /api/tasks                - 任务列表`);
      console.log(`    GET  /api/statistics/overview  - 总览统计`);
      console.log(`    GET  /api/statistics/by-guide  - 按讲解员统计`);
      console.log(`    GET  /api/statistics/by-language - 按语种统计`);
      console.log(`    GET  /api/statistics/by-month  - 按月统计`);
      console.log(`================================================\n`);
    });
  } catch (err) {
    console.error('启动失败:', err);
    process.exit(1);
  }
}

bootstrap();
