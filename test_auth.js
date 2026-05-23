const axios = require('axios');
axios.post('http://localhost:4000/api/auth/login', {loginId: "superadmin_test", password: "password"})
.then(res => console.log(res.data))
.catch(err => console.log(err.response ? err.response.data : err.message));
