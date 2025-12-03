// ===========================================
// 1. Durable Object 类定义 (ChatRoom)
// 注意：这里必须是 export class，它同时导出了 ChatRoom
// ===========================================
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env; // 包含 KV 绑定
    this.sessions = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/websocket") {
      return new Response("Not Found", { status: 404 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(socket) {
    socket.accept();
    this.sessions.push(socket);
    
    // --- 发送历史记录 ---
    const history = await this.env.CHAT_KV.list({ limit: 20, reverse: true });
    const historyDataPromises = history.keys.map(key => this.env.CHAT_KV.get(key.name));
    const historyData = await Promise.all(historyDataPromises);
    
    const initialMessage = historyData.filter(d => d).reverse().join('\n');
    if (initialMessage) {
        socket.send(`--- 历史记录 ---\n${initialMessage}`);
    }
    
    socket.addEventListener('message', async (event) => {
      const message = String(event.data).trim();
      if (!message) return;
      const timestamp = new Date().toISOString();
      const timeStr = timestamp.substring(0, 19).replace('T', ' ');
      const chatEntry = `[${timeStr}] User: ${message}`;
      await this.env.CHAT_KV.put(timestamp, chatEntry);
      this.sessions.forEach(s => {
        if (s.readyState === WebSocket.READY_STATE_OPEN) {
          s.send(chatEntry);
        }
      });
    });

    socket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s !== socket);
    });
  }
}

// ===========================================
// 2. Worker 入口逻辑 (路由)
// ===========================================
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // _worker.js 自动识别路由 /api/websocket
        if (url.pathname === "/api/websocket") {
            let id = env.CHAT_ROOM.idFromName("global-chat-room-instance");
            let stub = env.CHAT_ROOM.get(id);
            return stub.fetch(new Request("http://do/websocket", request));
        }

        return env.ASSETS.fetch(request);
    }
};

// ⚠️ 注意：最后一行多余的 export { ChatRoom } 已经被移除！
