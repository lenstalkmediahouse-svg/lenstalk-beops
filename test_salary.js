const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://kanhasahoo:Piki9438914652@lenstalk.wntigps.mongodb.net/lenstalk_ops?retryWrites=true&w=majority&appName=lenstalk')
  .then(async () => {
    const getModel = require('./src/modules/generic/generic.model');
    const Salary = getModel('salary_slips');
    const allSlips = await Salary.find({ employeeName: /puja/i });
    console.log(`Found ${allSlips.length} salary slips for Puja.`);
    process.exit(0);
  });
