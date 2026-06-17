const { makeModel, Op } = require('./dbHelper');
const { Task } = require('./Task');
const { Guide } = require('./Guide');

const Reassignment = makeModel('reassignments', 'id');

module.exports = { Reassignment, Op, Task, Guide };
