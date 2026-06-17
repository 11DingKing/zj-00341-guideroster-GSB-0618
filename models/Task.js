const { makeModel, Op } = require('./dbHelper');
const { Guide } = require('./Guide');

const TASK_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REASSIGNED: 'reassigned',
  CANCELLED: 'cancelled'
};

const TASK_TYPE = {
  NORMAL: 'normal',
  FOREIGN: 'foreign',
  STUDENT: 'student',
  VIP: 'vip'
};

const Task = makeModel('tasks', 'id');

module.exports = { Task, TASK_STATUS, TASK_TYPE, Op, Guide };
