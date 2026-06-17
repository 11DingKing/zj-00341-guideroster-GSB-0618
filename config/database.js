const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const adapter = new FileSync(path.join(__dirname, '..', 'db.json'));
const db = low(adapter);

const DEFAULTS = {
  guides: [],
  schedules: [],
  tasks: [],
  reassignments: [],
  counters: {
    guidesId: 0,
    schedulesId: 0,
    tasksId: 0,
    reassignmentsId: 0
  }
};

db.defaults(DEFAULTS).write();

module.exports = db;
