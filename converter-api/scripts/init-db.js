require("dotenv").config();

const auditStore = require("../audit-store");

auditStore
  .initSchema()
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error(`Database initialization failed: ${err.message}`);
    process.exit(1);
  });
