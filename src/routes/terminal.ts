import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import pty from 'node-pty';

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  // WebSocket route for live terminal
  app.get('/terminal', { websocket: true }, (socket: WebSocket, req) => {
    // Spawn a new PTY session
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || '/',
      env: process.env as Record<string, string>
    });

    app.log.info({ pid: ptyProcess.pid }, 'PTY session started');

    // Send PTY output to the websocket client
    ptyProcess.onData((data) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    });

    // Receive data from websocket client and send to PTY
    socket.on('message', (message: any) => {
      const msgStr = message.toString();
      try {
        const payload = JSON.parse(msgStr);
        if (payload.type === 'resize' && payload.cols && payload.rows) {
          ptyProcess.resize(payload.cols, payload.rows);
          return;
        }
      } catch (e) {
        // Not JSON, assume it's raw terminal input (keystrokes)
      }
      ptyProcess.write(msgStr);
    });

    // Handle WebSocket close
    socket.on('close', () => {
      app.log.info({ pid: ptyProcess.pid }, 'WebSocket closed, killing PTY');
      ptyProcess.kill();
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      app.log.info({ pid: ptyProcess.pid, exitCode, signal }, 'PTY exited');
      if (socket.readyState === socket.OPEN) {
        socket.send(`\r\n[Process exited with code ${exitCode}]\r\n`);
        socket.close();
      }
    });
  });
}

