import { handleTransferFileRequest } from '../server/transferRelay.js';

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  return handleTransferFileRequest(req, res);
}
