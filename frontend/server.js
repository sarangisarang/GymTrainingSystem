import { createServer } from "http";
import next from "next";

const port = 3000;
const host = "0.0.0.0";

const app = next({ dev: false, hostname: host, port });
const handle = app.getRequestHandler();

app.prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res);
    }).listen(port, host, () => {
      console.log(`> Next.js running on http://${host}:${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

