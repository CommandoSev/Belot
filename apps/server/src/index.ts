import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { SHARED_VERSION } from "@belot/shared";

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const clientDist = path.resolve(__dirname, "../../client/dist");

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, shared: SHARED_VERSION });
});

app.use(express.static(clientDist));
app.use((_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

io.on("connection", (socket) => {
  socket.emit("hello", { shared: SHARED_VERSION });
});

const port = Number(process.env.PORT ?? 3000);
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`belot server listening on ${port}`);
});
