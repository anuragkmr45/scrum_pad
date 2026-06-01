const http = require("http");

const port = process.env.PORT || 4000;
const url = `http://127.0.0.1:${port}/health`;

http
  .get(url, res => {
    let body = "";
    res.on("data", chunk => {
      body += chunk;
    });
    res.on("end", () => {
      console.log(`${res.statusCode} ${url}`);
      console.log(body);
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  })
  .on("error", err => {
    console.error(`Health check failed for ${url}: ${err.message}`);
    process.exit(1);
  });
