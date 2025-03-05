import net from 'net';

export async function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => {
            findAvailablePort(startPort + 1).then(resolve, reject);
        });
        server.listen(startPort, () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

export function generatePortRange(basePort) {
    return {
        tcp: basePort,
        ws: basePort + 1,
        api: basePort + 2,
        swarm: basePort + 3,
        gateway: basePort + 4
    };
}
