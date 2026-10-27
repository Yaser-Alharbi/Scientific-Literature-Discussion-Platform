// frontend/src/lib/firebase.ts

// Initialize Firebase
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { config } from '@/lib/appConfig';

const app = initializeApp(config.firebase);
export const auth = getAuth(app);
