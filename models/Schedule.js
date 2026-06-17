const { makeModel, Op } = require('./dbHelper');
const { Guide } = require('./Guide');

const Schedule = makeModel('schedules', 'id');

module.exports = { Schedule, Op, Guide };
