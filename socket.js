// socket.js
import { Server } from "socket.io";
import jwt from "jsonwebtoken";

export let io = null;

/**
 * Call this once after you create your HTTP server.
 * Returns the io instance and also registers connection handlers.
 */
export function initSocket(httpServer, { corsOrigin = "*" } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
    transports: ["websocket"],
  });

  io.on("connection", (socket) => {
    // token sent via auth on client: io({ auth: { token }})
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    let userId = null;
    try {
      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        userId = payload?.userId || payload?.id || null;
      }
    } catch (_) {}

    if (!userId) {
      // no auth => disconnect or keep anonymous as you prefer
      socket.disconnect(true);
      return;
    }

    // Join personal room and the Rudhram group room
    socket.join(`user:${userId}`);
    socket.join("group:RUDHRAM");

    socket.on("disconnect", () => {
      // optional logs/cleanup
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
