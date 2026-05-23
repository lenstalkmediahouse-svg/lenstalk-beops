const axios = require('axios');
axios.post('http://localhost:4000/api/auth/login', {loginId: "super_admin", password: "password"})
.then(res => console.log(res.data))
.catch(err => console.log(err.response.data));
