import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo<any> | undefined;
  }
}

window.Pusher = Pusher;

let echoInstance: Echo<any> | null = null;

export function getEcho(): Echo<any> {
  if (echoInstance) {
    return echoInstance;
  }

  const host = import.meta.env.VITE_REVERB_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const port = Number(import.meta.env.VITE_REVERB_PORT || 8080);
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';
  const key = import.meta.env.VITE_REVERB_APP_KEY || 'xyarqae6lv3xk9x9ruyv';
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  const authEndpoint = apiUrl.replace(/\/v1\/?$/, '') + '/broadcasting/auth';
  const isHttps = scheme === 'https';

  echoInstance = new Echo({
    broadcaster: 'reverb',
    key: key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: isHttps,
    enabledTransports: isHttps ? ['wss'] : ['ws'],
    disableStats: true,
    namespace: '',
    authEndpoint: authEndpoint,
    auth: {
      headers: {
        Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '',
        Accept: 'application/json',
      },
    },
    authorizer: (channel: any) => {
      return {
        authorize: (socketId: string, callback: (error: Error | null, data: any) => void) => {
          const currentToken = localStorage.getItem('token');
          fetch(authEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: currentToken ? `Bearer ${currentToken}` : '',
            },
            body: JSON.stringify({
              socket_id: socketId,
              channel_name: channel.name,
            }),
          })
            .then((res) => {
              if (!res.ok) {
                throw new Error(`Broadcast auth failed with status ${res.status}`);
              }
              return res.json();
            })
            .then((data) => callback(null, data))
            .catch((err) => callback(err, null));
        },
      };
    },
  });

  window.Echo = echoInstance;
  return echoInstance;
}

export function resetEcho(): void {
  if (echoInstance) {
    try {
      echoInstance.disconnect();
    } catch {
      // ignore
    }
    echoInstance = null;
    window.Echo = undefined;
  }
}


