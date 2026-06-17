const http = require('http');

function req(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 3001, path: url, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  try {
    console.log('\n======== 冒烟测试开始 ========\n');

    console.log('1. 讲解员列表:');
    const guides = await req('/api/guides');
    console.log(`   数量: ${guides.data.length}`);
    guides.data.forEach(g => console.log(`   ${g.id}. ${g.name} | ${g.employeeNo} | ${g.level} | 语种:${g.languages.join(',')}`));

    console.log('\n2. 排班列表 (前5条):');
    const scheds = await req('/api/schedules');
    console.log(`   总数: ${scheds.data.length}`);
    scheds.data.slice(0, 5).forEach(s => console.log(`   ${s.id}. ${s.date} ${s.startTime}-${s.endTime} | ${s.guide.name} | ${s.hall} | ${s.shiftType}`));

    console.log('\n3. 任务状态分布:');
    const tasks = await req('/api/tasks');
    const status = {};
    const statusMap = { pending: '待分派', assigned: '已派单', accepted: '已接单', in_progress: '讲解中', completed: '已完成', reassigned: '已改派' };
    tasks.data.forEach(t => status[t.status] = (status[t.status] || 0) + 1);
    console.log(`   总数: ${tasks.data.length}`);
    Object.entries(status).forEach(([k, v]) => console.log(`   ${statusMap[k] || k}: ${v}`));

    console.log('\n4. 统计总览:');
    const ov = await req('/api/statistics/overview');
    console.log(`   场次:${ov.totalTasks} | 时长:${ov.totalMinutes}分钟 | 人次:${ov.totalVisitors} | 外文占比:${ov.foreignPercentage}%`);
    console.log(`   待分派:${ov.pendingCount} | 讲解中:${ov.inProgressCount} | 已完成:${ov.completedCount}`);

    console.log('\n5. 按讲解员统计 (前3名):');
    const bg = await req('/api/statistics/by-guide');
    bg.data.slice(0, 3).forEach(r => console.log(`   ${r.guideName}: 场次${r.taskCount} 时长${r.totalMinutes}分 外文占比${r.foreignPercentage}%`));

    console.log('\n6. 按语种统计:');
    const bl = await req('/api/statistics/by-language');
    bl.data.forEach(l => console.log(`   ${l.language}${l.isForeign ? '(外)' : ''}: 场次${l.taskCount} 占比${l.percentage}%`));

    const pendingTask = tasks.data.find(t => t.status === 'pending' && t.language !== '中文');
    if (pendingTask) {
      console.log(`\n7. 智能匹配候选人 (任务#${pendingTask.id} ${pendingTask.groupName} 语种:${pendingTask.language} 主题:${pendingTask.theme}):`);
      const m = await req(`/api/tasks/${pendingTask.id}/match-guides`);
      console.log(`   匹配到 ${m.data.length} 名候选人:`);
      m.data.forEach(c => console.log(`   ${c.name}[${c.level}] 语种匹配:${c.languageMatch} 主题匹配:${c.themeMatch} 原因:${c.reason}`));

      console.log(`\n8. 自动派单给任务#${pendingTask.id}:`);
      const assignResult = await req(`/api/tasks/${pendingTask.id}/auto-assign`, 'POST');
      console.log(`   ${assignResult.success ? '成功' : '失败:' + assignResult.message} 派给: ${assignResult.data.guide && assignResult.data.guide.name}`);

      if (assignResult.success && assignResult.data.status === 'assigned') {
        console.log(`\n9. 讲解员接单:`);
        const acceptR = await req(`/api/tasks/${assignResult.data.id}/accept`, 'POST');
        console.log(`   ${acceptR.success ? '接单成功 状态:' + acceptR.data.status : '失败:' + acceptR.message}`);

        console.log(`\n10. 开始讲解:`);
        const startR = await req(`/api/tasks/${acceptR.data.id}/start`, 'POST');
        console.log(`   ${startR.success ? '开始成功 状态:' + startR.data.status : '失败:' + startR.message}`);

        console.log(`\n11. 完成讲解 (实际时长75分钟):`);
        const compR = await req(`/api/tasks/${startR.data.id}/complete`, 'POST', { actualMinutes: 75 });
        console.log(`   ${compR.success ? '完成成功 时长:' + compR.data.actualMinutes + '分 状态:' + compR.data.status : '失败:' + compR.message}`);
      }
    }

    console.log('\n======== 冒烟测试完成 ========\n');
  } catch (e) {
    console.error('测试出错:', e.message);
  }
})();
