// socket.io-client@2 ships no TypeScript types. Minimal shim covering
// only what useSocketIO.ts needs — extend if more surface required.
declare module 'socket.io-client' {
  export interface SocketIOClientOptions {
    transports?: string[];
    reconnection?: boolean;
    reconnectionDelay?: number;
    timeout?: number;
    forceNew?: boolean;
    path?: string;
  }

  export interface Socket {
    id: string;
    connected: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io emits heterogeneous, untyped payloads
    on(event: string, listener: (...args: any[]) => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io emits heterogeneous, untyped payloads
    off(event: string, listener?: (...args: any[]) => void): this;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io emits heterogeneous, untyped payloads
    emit(event: string, ...args: any[]): this;
    removeAllListeners(event?: string): this;
    disconnect(): this;
    close(): this;
  }

  export function io(uri: string, opts?: SocketIOClientOptions): Socket;
  export default io;
}
