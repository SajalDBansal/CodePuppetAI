import { createServer } from "./server.js";
import { envConfig } from "./utils/config.js";

const port = envConfig.PORT;
const server = createServer();

server.listen(port, () => {
  console.log(`Backend Api server running on ${port}`);
});
