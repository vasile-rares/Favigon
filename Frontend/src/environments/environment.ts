const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

export const environment = {
  production: !isLocalHost,
  apiBaseUrl: isLocalHost ? 'http://localhost:5207/api' : '/api',
  githubClientId: '',
  googleClientId: '',
};
