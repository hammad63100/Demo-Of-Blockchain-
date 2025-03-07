import { exec, execSync } from 'child_process';
import net from 'net';

export const checkPortInUse = (port) => {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.once('close', () => resolve(false));
                server.close();
            })
            .listen(port);
    });
};

export const killProcessOnPort = async (port) => {
    try {
        if (process.platform === 'win32') {
            execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' })
                .toString()
                .split('\n')
                .forEach(line => {
                    const pid = line.match(/\s+(\d+)\s*$/)?.[1];
                    if (pid) execSync(`taskkill /F /PID ${pid}`);
                });
        } else {
            execSync(`lsof -i :${port} -t | xargs kill -9`, { stdio: 'pipe' });
        }
    } catch (e) {
        // Process might not exist, which is fine
    }
};
