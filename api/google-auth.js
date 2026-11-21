import { handleGoogleAuthRequest } from '../server/googleAuthHandler.js';

export const config = {
  maxDuration: 15,
};

export default async function handler(req, res) {
  return handleGoogleAuthRequest(req, res);
}
