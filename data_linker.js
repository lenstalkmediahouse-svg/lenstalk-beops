const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    console.log('Connected to DB. Starting Data Linker...');
    const User = require('./src/modules/users/user.model');
    const Employee = require('./src/modules/employees/employee.model');
    const getModel = require('./src/modules/generic/generic.model');
    const Attendance = getModel('attendance_records');
    const Salary = getModel('salary_slips');
    const Leaves = getModel('lenstalk_leaves_v1'); // if generic

    const allEmps = await Employee.find();
    
    for (const emp of allEmps) {
      if (!emp.userId) continue;

      const user = await User.findById(emp.userId);
      if (!user) continue;

      console.log(`Processing data for ${emp.fullName} (Code: ${emp.employeeCode}, New Emp ID: ${emp._id}, User ID: ${emp.userId})`);

      // 1. Recover Gross Salary from latest Salary Slip
      // Some old salary slips might be linked by userId, or we can just match by employeeName / email
      const latestSlip = await Salary.findOne({ 
        $or: [
          { employeeId: emp._id.toString() },
          { userId: emp.userId.toString() },
          { employeeName: emp.fullName }
        ]
      }).sort({ createdAt: -1 });

      if (latestSlip && latestSlip.grossMonthly && emp.salaryStructure.grossMonthly === 0) {
        console.log(`  -> Recovered Gross Salary: ${latestSlip.grossMonthly}`);
        emp.salaryStructure.grossMonthly = Number(latestSlip.grossMonthly);
        await emp.save();
      }

      // 2. Relink Attendance Records
      // Update any attendance record that belongs to this person to point to the NEW employeeId
      // and ensure employeeCode is set correctly.
      const attendanceRes = await Attendance.updateMany(
        { 
          $or: [
            { employeeId: emp._id.toString() },
            { userId: emp.userId.toString() },
            { employeeName: emp.fullName },
            { employeeCode: emp.employeeCode }
          ]
        },
        { 
          $set: { 
            employeeId: emp._id.toString(),
            employeeCode: emp.employeeCode,
            userId: emp.userId.toString()
          } 
        }
      );
      if (attendanceRes.modifiedCount > 0) {
        console.log(`  -> Relinked ${attendanceRes.modifiedCount} Attendance records.`);
      }

      // 3. Relink Salary Slips
      const salaryRes = await Salary.updateMany(
        { 
          $or: [
            { employeeId: emp._id.toString() },
            { userId: emp.userId.toString() },
            { employeeName: emp.fullName }
          ]
        },
        { 
          $set: { 
            employeeId: emp._id.toString(),
            userId: emp.userId.toString()
          } 
        }
      );
      if (salaryRes.modifiedCount > 0) {
        console.log(`  -> Relinked ${salaryRes.modifiedCount} Salary slips.`);
      }
    }

    console.log('Data Linker complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
