'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  UserCredential,
  GoogleAuthProvider,
  signInWithPopup,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '@/lib/firebase';
import { api } from '@/lib/api';
import type { ProfileUpdate, User } from '@/types/user';

// Firebase errors carry a code such as 'auth/invalid-credential'; everything else is shown by its message.
function errorCode(error: unknown): string | undefined {
  return error instanceof FirebaseError ? error.code : undefined;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function discardNewAccount(user: UserCredential['user']) {
  try {
    await user.delete();
  } catch (error) {
    console.error('Could not delete the new Firebase account:', error);
  }
}

async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth.currentUser;
  return currentUser ? currentUser.getIdToken(forceRefresh) : null;
}

//structure of the authentication state so we can use it in the store
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

//the available actions the store can perform
interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  registerGoogleUser: () => Promise<void>;
  register: (email: string, password: string, names?: { first_name?: string; last_name?: string }) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (changes: ProfileUpdate) => Promise<void>;
  setPassword: (password: string, currentPassword?: string) => Promise<void>;
  clearError: () => void;
  refreshToken: () => Promise<void>;
  syncAuthState: () => void;
  fetchResearchInterests: () => Promise<string[]>;
}

// Combined interface for state and actions
interface AuthStore extends AuthState, AuthActions {}

let unsubscribeAuthListener: (() => void) | undefined;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Action to clear any error messages
      clearError: () => set({ error: null }),

      // Login action - authenticates a user with Firebase and stores the token
      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null });
          
          
          // login in with Firebase
          const userCredential: UserCredential = await signInWithEmailAndPassword(auth, email, password);
          const token = await userCredential.user.getIdToken();
          
          if (!token) {
            throw new Error('Failed to get authentication token');
          }
          
          set({ token, isLoading: false });
          
          // fetch user profile
          await get().fetchProfile();
          
          // check if profile fetch resulted in an error
          const state = get();
          if (state.error || !state.isAuthenticated) {
            // if backend auth failed, sign out of Firebase
            try {
              await signOut(auth);
            } catch (e) {
              console.error("Error signing out:", e);
            }
            
            throw new Error(state.error || 'Failed to authenticate with backend');
          }
        } catch (error) {
          // Check for specific Firebase auth errors and provide user-friendly messages
          const code = errorCode(error);
          const message = code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
            ? 'Incorrect account information'
            : messageOf(error, 'Failed to login');
          
          set({ 
            isLoading: false, 
            error: message,
            isAuthenticated: false,
            token: null,
            user: null
          });
          
          // re-throw to allow component to handle
          throw error;
        }
      },

      // Google Login action - authenticates with Google via Firebase and stores the token
      googleLogin: async () => {
        try {
          set({ isLoading: true, error: null });
          
          const provider = new GoogleAuthProvider();
          
          // Sign in with Google popup
          const userCredential: UserCredential = await signInWithPopup(auth, provider);

          await new Promise(resolve => setTimeout(resolve, 500));
          
          const token = await userCredential.user.getIdToken(true);
          
          if (!token) {
            throw new Error('Failed to get authentication token');
          }
          
          set({ token, isLoading: false });
          
          // fetch user profile
          await get().fetchProfile();
          
          // check if profile fetch resulted in an error 
          const state = get();
          if (state.error || !state.isAuthenticated) {
            // if backend auth failed, sign out of Firebase
            try {
              await signOut(auth);
            } catch (e) {
              console.error("Error signing out:", e);
            }
            
            throw new Error(state.error || 'Failed to authenticate with backend');
          }
        } catch (error) {
          // Check for specific Firebase auth errors and provide user-friendly messages
          const code = errorCode(error);
          const message = code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/popup-closed-by-user'
            ? 'Incorrect account information'
            : messageOf(error, 'Failed to login with Google');
          
          set({ 
            isLoading: false, 
            error: message,
            isAuthenticated: false,
            token: null,
            user: null
          });
          
          // re-throw to allow component to handle
          throw error;
        }
      },

      // Register Google user action - registers a Google-authenticated user in the backend
      registerGoogleUser: async () => {
        try {
          set({ isLoading: true, error: null });
          
          // create a Google auth provider
          const provider = new GoogleAuthProvider();
          
          // sign in with Google popup
          const userCredential: UserCredential = await signInWithPopup(auth, provider);
          
          //fresh token
          const token = await userCredential.user.getIdToken(true);
          
         
          set({ token, isLoading: false });
          
          
          // a failure here is cleaned up by the catch below (Firebase sign-out, cleared state)
          await api.register({ auth_methods: 'google' });

          const freshToken = await userCredential.user.getIdToken(true);
          set({ token: freshToken });

          try {
            await get().fetchProfile();

            const state = get();
            if (!state.isAuthenticated || !state.user) {
              throw new Error('Failed to complete Google registration');
            }
          } catch (profileError) {
            console.warn("User registered but couldn't fetch profile:", profileError);
            set({ isAuthenticated: true });
          }
            
          set({ isLoading: false });
        } catch (error) {

          try {
            await signOut(auth);
          } catch (e) {
            console.error("Error signing out:", e);
          }
          
          set({ 
            isLoading: false, 
            error: messageOf(error, 'Failed to register Google user'),
            token: null,
            user: null,
            isAuthenticated: false
          });
          throw error;
        }
      },

      // Register action - creates a new user in Firebase and the backend
      register: async (email: string, password: string, names?: { first_name?: string; last_name?: string }) => {
        try {
          set({ isLoading: true, error: null });
          
          // create user in Firebase
          const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, email, password);
          const token = await userCredential.user.getIdToken(true);
          
          if (!token) {
            throw new Error('Failed to get authentication token');
          }
          
          // register user in backend
          try {
            await api.register({ auth_methods: 'email', password, ...names });
          } catch (registerError) {
            // Without a backend user the new Firebase account is a dead end: login says "not registered" and
            // signup says "email already in use". Remove it so the person can simply try again.
            await discardNewAccount(userCredential.user);
            throw registerError;
          }
          
          set({ token, isLoading: false });


          const freshToken = await userCredential.user.getIdToken(true);
          set({ token: freshToken });
          
          await get().fetchProfile();

          const state = get();
          if (!state.user || !state.isAuthenticated) {
            throw new Error('Failed to complete registration');
          }
          
        } catch (error) {
          try {
            signOut(auth);
          } catch (e) {
            console.error("Error signing out:", e);
          }

          set({ 
            isLoading: false, 
            error: messageOf(error, 'Failed to register'),
            isAuthenticated: false,
            token: null,
            user: null
          });
          throw error;
        }
      },

      // Logout action - signs out the user and clears the state
      logout: () => {
        try {
          // Sign out from Firebase
          signOut(auth);
          
          // Clear state
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false 
          });
        } catch (error) {
          set({ error: messageOf(error, 'Failed to logout') });
        }
      },

      // fetchProfile action - fetches the user profile from the backend
      fetchProfile: async () => {
        // after a page load Firebase restores the session asynchronously
        await auth.authStateReady();
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          set({ error: 'No authentication token available', isAuthenticated: false, token: null });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const user = await api.getProfile();
          set({ user, token: await firebaseUser.getIdToken(), isLoading: false, isAuthenticated: true });
        } catch (error) {
          set({
            isLoading: false,
            error: messageOf(error, 'Failed to fetch profile'),
            isAuthenticated: false,
            user: null,
            token: null
          });

          try {
            await signOut(auth);
          } catch (e) {
            console.error("Error signing out of Firebase:", e);
          }
        }
      },

      // update profile action - updates the user profile in the backend
      updateProfile: async (changes: ProfileUpdate) => {
        try {
          set({ isLoading: true, error: null });
          // the backend answers with the updated profile
          const user = await api.updateProfile(changes);
          set({ user, isLoading: false });
        } catch (error) {
          console.error('Error in updateProfile action:', error);
          set({ 
            isLoading: false, 
            error: messageOf(error, 'Failed to update profile')
          });
          throw error; // re-throw to so component can catch it
        }
      },

      //setPassword action - sets the user's password in Firebase and the backend
      setPassword: async (newPassword: string, currentPassword?: string) => {
        const { token } = get();
        
        if (!token) {
          set({ error: 'No authentication token available' });
          return;
        }
        
        try {
          set({ isLoading: true, error: null });
          
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error('No authenticated user found');
          }
          
          // determine if user is a Google user
          const isGoogleUser = currentUser.providerData.some(
            provider => provider.providerId === 'google.com'
          );
          
          // reauthenticate the user before changing password
          if (!isGoogleUser && currentPassword) {
            // email users need password reauthentication
            try {
              const credential = EmailAuthProvider.credential(
                currentUser.email || '', 
                currentPassword
              );
              await reauthenticateWithCredential(currentUser, credential);
            } catch (error) {
              console.error('Reauthentication error:', error);
              throw new Error('Current password is incorrect');
            }
          } else if (isGoogleUser) {
            // google users need to reauthenticate with Google
            const provider = new GoogleAuthProvider();
            try {
              await signInWithPopup(auth, provider);
            } catch (error) {
              console.error('Google reauthentication error:', error);
              throw new Error('Please reauthenticate with Google to change your password');
            }
          }
          
          // update firebase password
          try {
            await updatePassword(currentUser, newPassword);
          } catch (error) {
            if (errorCode(error) === 'auth/requires-recent-login') {
              throw new Error('For security reasons, please log out and log back in, then try changing your password again');
            }
            throw error;
          }
          
          // get fresh token after password change
          const freshToken = await currentUser.getIdToken(true);
          
          // update password in backend
          await api.setPassword(newPassword);
          
          set({ token: freshToken, isLoading: false });
        } catch (error) {
          set({ 
            isLoading: false, 
            error: messageOf(error, 'Failed to set password')
          });
          throw error;
        }
      },

      // refresh token action - refreshes the user's token and updates the state
      refreshToken: async () => {
        try {
          set({ isLoading: true, error: null });
          
        const token = await getAuthToken(true);
        
        if (!token) {
          throw new Error('No authenticated user found');
        }
        
        set({ token, error: null, isLoading: false });
        
        // fetch profile after token refresh
        await get().fetchProfile();
      } catch (error) {
        set({ 
          isLoading: false, 
          error: messageOf(error, 'Failed to refresh token')
        });
      }
      },

      // sync auth state action - syncs the auth state with the backend
      syncAuthState: () => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
          try {
            const { isAuthenticated } = get();
            
            if (user && !isAuthenticated) {
              // user is signed in with Firebase but not in store
              const token = await getAuthToken(true);
              if (token) {
                set({ token, isAuthenticated: true });
                get().fetchProfile();
              }
            } 
            else if (!user && isAuthenticated) {
              // user is signed out of Firebase but still in store
              get().logout();
            }
            else if (user && isAuthenticated) {
              // user is signed in both places, but might need profile data
              const { user: storeUser } = get();
              if (!storeUser) {
                get().fetchProfile();
              }
            }
          } catch (error) {
            console.error('Auth sync error:', error);
          }
        });
        // replace the previous listener so repeated calls do not stack subscriptions
        unsubscribeAuthListener?.();
        unsubscribeAuthListener = unsubscribe;
      },

      // fetch research interests action - fetches the research interests from the backend
      fetchResearchInterests: async () => {
        try {
          const response = await fetch('/api/research-interests');
          if (response.ok) {
            return await response.json();
          }
          return [];
        } catch (error) {
          console.error('Error fetching research interests:', error);
          return [];
        }
      }
    }),

    {
      name: 'auth-storage', 
      partialize: (state) => ({ 
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        user: state.user
      })
    }
  )
); 


if (typeof window !== 'undefined') {
  // Initialize auth sync after store is created
  setTimeout(() => {
    useAuthStore.getState().syncAuthState();
  }, 100);
}
