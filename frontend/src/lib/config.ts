export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  livekitUrl: string;
  firebase: FirebaseConfig;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to frontend/.env.local and fill it in.`);
  }
  return value;
}

export function readConfig(env: Env): AppConfig {
  return {
    apiBaseUrl: required(env, 'NEXT_PUBLIC_API_BASE_URL').replace(/\/+$/, ''),
    livekitUrl: env.NEXT_PUBLIC_LIVEKIT_URL ?? '',
    firebase: {
      apiKey: required(env, 'NEXT_PUBLIC_FIREBASE_API_KEY'),
      authDomain: required(env, 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
      projectId: required(env, 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      storageBucket: required(env, 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: required(env, 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
      appId: required(env, 'NEXT_PUBLIC_FIREBASE_APP_ID'),
    },
  };
}
