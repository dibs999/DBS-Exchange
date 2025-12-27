import { WsMessage } from '@dbs/shared';

export type WsClient = {
  send: (data: string) => void;
};

const clients = new Set<WsClient>();

export function addWsClient(client: WsClient) {
  clients.add(client);
}

export function removeWsClient(client: WsClient) {
  clients.delete(client);
}

export function broadcast(message: WsMessage) {
  const payload = JSON.stringify(message);
  clients.forEach((client) => client.send(payload));
}
