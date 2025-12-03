// ----------------------------------------------------
// 1. Durable Object: ChatRoom 类 (核心状态管理)
// ----------------------------------------------------
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env; // env 包含 KV 绑定
    this.sessions = []; // 存储所有 WebSocket 连接
    // 从 DO 内部存储加载最近的历史消息（可选）
    // state.storage.get("history").then(h => this.history = h || []); 
  }

  // 处理来自路由器的 WebSocket 请求
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/websocket") {
      return new Response("Not Found", { status: 404 });
    }

    // 升级 HTTP 请求到 WebSocket
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    await this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // 处理单个 WebSocket 连接
  async handleSession(socket) {
    socket.accept();
    this.sessions.push(socket);
    console.log(`New session established. Total sessions: ${this.sessions.length}`);

    // 发送历史记录 (简化版：只发送最近的10条KV记录)
    const history = await this.env.CHAT_KV.list({ limit: 10, reverse: true });
    
    // 从 KV 获取实际数据
    const historyDataPromises = history.keys.map(key => this.env.CHAT_KV.get(key.name));
    const historyData = await Promise.all(historyDataPromises);
    
    // 准备并发送历史消息
    const initialMessage = historyData.filter(d => d).reverse().join('\n');
    if (initialMessage) {
        socket.send(`--- 历史记录 ---\n${initialMessage}`);
    }

    // 监听客户端消息
    socket.addEventListener('message', async (event) => {
      const message = event.data;
      const timestamp = new Date().toISOString();
      const chatEntry = `[${timestamp}] User: ${message}`;

      // 1. 持久化到 KV
      await this.env.CHAT_KV.put(timestamp, chatEntry);

      // 2. 广播给所有连接
      this.sessions.forEach(s => {
        if (s.readyState === WebSocket.READY_STATE_OPEN) {
          s.send(chatEntry);
        }
      });
    });

    // 监听连接关闭
    socket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s !== socket);
      console.log(`Session closed. Remaining sessions: ${this.sessions.length}`);
    });
  }
}

// ----------------------------------------------------
// 2. Worker 入口逻辑 (路由到 Durable Object)
// ----------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 处理 WebSocket 请求
    if (url.pathname === "/api/chat/websocket") {
      // 这里的 'global-chat-room' 是固定的名称，确保所有用户连接到同一个实例
      let id = env.CHAT_ROOM.idFromName("global-chat-room");
      let stub = env.CHAT_ROOM.get(id);

      // 转发请求给 Durable Object
      return stub.fetch(new Request("http://do/websocket", request));
    }

    // 2. 对于其他请求（如静态文件），让 Pages 自己处理
    // 通常 Pages Functions 不会处理静态文件，但这里为了完整性，可以返回一个 NotFound
    return new Response("This is the Function endpoint. Use /api/chat/websocket for chat.", { status: 404 });
  }
};
