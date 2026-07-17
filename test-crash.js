const axios = require('axios');
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb+srv://lenstalkmediahouse_db_user:HefgSWSoVrSzP2ib@operation.b5fv3kv.mongodb.net/lenstalk_os?retryWrites=true&w=majority&appName=operation');
  
  const Employee = require('./src/modules/employees/employee.model');
  const getModel = require('./src/modules/generic/generic.model');
  
  // Test if getModel('hr_daily_reports') crashes
  const HRModel = getModel('hr_daily_reports');
  const reports = await HRModel.find({ isArchived: { $ne: true } }).limit(5);
  console.log('HR reports count:', reports.length);
  
  const emp = await Employee.findOne();
  console.log('Testing compute for emp', emp._id.toString());
  
  // Mock req/res for compute
  const startDate = '2026-07-01';
  const endDate = '2026-07-31';
  const monthStr = '2026-07';
  
  const empObjectId = new mongoose.Types.ObjectId(emp._id.toString());
  const empIdConditions = [{ employeeId: emp._id.toString() }, { employeeId: empObjectId }];
  
  const AttModel = getModel('attendance_records');
  const attRecords = await AttModel.find({
    $or: empIdConditions,
    date: { $gte: startDate, $lte: endDate },
    isArchived: { $ne: true },
  });
  console.log('Att records:', attRecords.length);
  
  const ContentModel = getModel('content_tasks');
  const assignedTasks = await ContentModel.find({
    isArchived: { $ne: true },
    $and: [
      {
        $or: [
          { assignedTo: emp.fullName },
          { assignedEmployee: emp._id.toString() },
          { assignedEmployee: empObjectId }
        ]
      },
      {
        $or: [
          { deadline: { $regex: `^${monthStr}` } },
          { createdAt: { $gte: new Date(startDate), $lte: new Date('2026-07-31T23:59:59') } }
        ]
      }
    ]
  });
  console.log('Tasks:', assignedTasks.length);
  
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
