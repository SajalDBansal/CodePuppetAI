import { createServer } from "./server.js";
import { environment } from "./utils/environment.js";

const server = createServer();

server.listen(environment.PORT, () => {
  console.log(`API server listening on port ${environment.PORT}.`)
});
