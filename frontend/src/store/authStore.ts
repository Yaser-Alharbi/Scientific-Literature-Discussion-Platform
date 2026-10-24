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
import { auth } from '@/lib/firebase';

async function getAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    
    return await currentUser.getIdToken(forceRefresh);
  } catch (error: any) {
    // Handle token timing errors with retry
    if (error.message?.includes('Token used too early')) {
      // Wait 1.5 seconds to allow clocks to synchronize
      await new Promise(resolve => setTimeout(resolve, 1500));
      const user = auth.currentUser;
      if (!user) return null;
      return user.getIdToken(true);
    }
    
    throw error;
  }
}

// defines the structure of user data based on the backend authentication/models.py file
interface User {
  email: string;
  institution?: string;
  bio?: string;
  research_interests?: string[];
  provider?: string;
  auth_methods?: string;
  first_name?: string;
  last_name?: string;
  password_set?: boolean;
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
  registerGoogleUser: (userData?: Partial<User>) => Promise<void>;
  register: (email: string, password: string, userData?: Partial<User>) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (userData: Partial<User>) => Promise<void>;
  setPassword: (password: string, currentPassword?: string) => Promise<void>;
  clearError: () => void;
  refreshToken: () => Promise<void>;
  syncAuthState: () => void;
  fetchResearchInterests: () => Promise<string[]>;
}

// Combined interface for state and actions
interface AuthStore extends AuthState, AuthActions {}

// API endpoint URLs
const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_ENDPOINTS = {
  VERIFY_TOKEN: `${API_URL}/api/verify-token`,
  USER_PROFILE: `${API_URL}/api/user-profile`,
  REGISTER: `${API_URL}/api/register`,
  SET_PASSWORD: `${API_URL}/api/set-password`,
  UPDATE_PROFILE: `${API_URL}/api/update-profile`,
  RESEARCH_INTERESTS: `${API_URL}/api/research-interests`,
};

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
        } catch (error: any) {
          // Check for specific Firebase auth errors and provide user-friendly messages
          let errorMessage = 'Failed to login';
          
          if (error.code === 'auth/invalid-credential' || 
              error.code === 'auth/wrong-password' || 
              error.code === 'auth/user-not-found') {
            errorMessage = 'Incorrect account information';
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          set({ 
            isLoading: false, 
            error: errorMessage,
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
        } catch (error: any) {
          // Check for specific Firebase auth errors and provide user-friendly messages
          let errorMessage = 'Failed to login with Google';
          
          if (error.code === 'auth/invalid-credential' || 
              error.code === 'auth/wrong-password' || 
              error.code === 'auth/user-not-found' ||
              error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Incorrect account information';
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          set({ 
            isLoading: false, 
            error: errorMessage,
            isAuthenticated: false,
            token: null,
            user: null
          });
          
          // re-throw to allow component to handle
          throw error;
        }
      },

      // Register Google user action - registers a Google-authenticated user in the backend
      registerGoogleUser: async (userData?: Partial<User>) => {
        try {
          set({ isLoading: true, error: null });
          
          // create a Google auth provider
          const provider = new GoogleAuthProvider();
          
          // sign in with Google popup
          const userCredential: UserCredential = await signInWithPopup(auth, provider);
          
          //fresh token
          const token = await userCredential.user.getIdToken(true);
          
         
          set({ token, isLoading: false });
          
          
          const response = await fetch(AUTH_ENDPOINTS.REGISTER, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              ...userData,
              auth_methods: 'google',
              is_google_user: true
            })
          });
          
          if (!response.ok) {
            const data = await response.json();
            // if registration fails clean up firebase auth
            await signOut(auth);
            set({ token: null });
            throw new Error(data.error || 'Failed to register Google user');
          }
          

          const freshToken = await userCredential.user.getIdToken(true);
          set({ token: freshToken });

          try {
            await get().fetchProfile();

            const state = get();
            if (!state.isAuthenticated || !state.user) {
              throw new Error('Failed to complete Google registration');
            }
          } catch (profileError: any) {
            console.warn("User registered but couldn't fetch profile:", profileError);
            set({ isAuthenticated: true });
          }
            
          set({ isLoading: false });
        } catch (error: any) {

          try {
            await signOut(auth);
          } catch (e) {
            console.error("Error signing out:", e);
          }
          
          set({ 
            isLoading: false, 
            error: error.message || 'Failed to register Google user',
            token: null,
            user: null,
            isAuthenticated: false
          });
          throw error;
        }
      },

      // Register action - creates a new user in Firebase and the backend
      register: async (email: string, password: string, userData?: Partial<User>) => {
        try {
          set({ isLoading: true, error: null });
          
          // create user in Firebase
          const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, email, password);
          const token = await userCredential.user.getIdToken(true);
          
          if (!token) {
            throw new Error('Failed to get authentication token');
          }
          
          // register user in backend
          const response = await fetch(AUTH_ENDPOINTS.REGISTER, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              ...userData,
              email,
              password
            })
          });
          
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to register user');
          }
          
          set({ token, isLoading: false });


          const freshToken = await userCredential.user.getIdToken(true);
          set({ token: freshToken });
          
          await get().fetchProfile();

          const state = get();
          if (!state.user || !state.isAuthenticated) {
            throw new Error('Failed to complete registration');
          }
          
        } catch (error: any) {
          try {
            signOut(auth);
          } catch (e) {
            console.error("Error signing out:", e);
          }

          set({ 
            isLoading: false, 
            error: error.message || 'Failed to register',
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
        } catch (error: any) {
          set({ error: error.message || 'Failed to logout' });
        }
      },

      // fetchProfile action - fetches the user profile from the backend
      fetchProfile: async () => {
        let retries = 2;  // number of retries for fetching the profile, sometimes the token is not refreshed fast enough based on testing 2 is enough might make it 3 or 4 to be safe
        
        while (retries >= 0) {
          try {
            const { token } = get();
            let currentToken = token;
            
            if (!currentToken || get().error?.includes('Token used too early')) {
              currentToken = await getAuthToken(true); // force refresh token
            }
            
            if (!currentToken) {
              console.error('No authentication token available');
              set({ 
                error: 'No authentication token available',
                isAuthenticated: false, 
                token: null 
              });
              return;
            }
            
            set({ isLoading: true, error: null });
            
            const response = await fetch(AUTH_ENDPOINTS.USER_PROFILE, {
              headers: {
                'Authorization': `Bearer ${currentToken}`
              }
            });
            
            if (!response.ok) {
              const data = await response.json();
              
              // 401 or 403 = user isn't authenticated in the backend
              if ((response.status === 401 || response.status === 403) && retries > 0) {
                // wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
                retries--;
                continue; // retry
              }
              
              if (response.status === 401 || response.status === 403) {
                set({ 
                  isAuthenticated: false, 
                  isLoading: false,
                  user: null,
                  token: null, 
                  error: 'You are authenticated with Firebase but not registered in our system. Please contact support.'
                });
                
                // sign out from Firebas
                try {
                  signOut(auth);
                } catch(e) {
                  console.error("Error signing out of Firebase:", e);
                }
                
                return;
              }
              
              throw new Error(data.error || 'Failed to fetch user profile');
            }
            
            const userData = await response.json();
            
            const providerData = auth.currentUser?.providerData || [];
            const provider = providerData.find(p => p.providerId === 'google.com') 
              ? 'google.com'
              : 'password';
            
            set({
              user: userData,
              isLoading: false,
              token: currentToken,
              isAuthenticated: true 
            });
            
            break;
            
          } catch (error: any) {

            if (error.message?.includes('Token used too early') && retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              retries--;
              continue;
            }
            
            set({ 
              isLoading: false, 
              error: error.message || 'Failed to fetch profile',
              isAuthenticated: false,
              user: null,
              token: null 
            });
            
            try {
              signOut(auth);
            } catch(e) {
              console.error("Error signing out of Firebase:", e);
            }
            
            return;
          }
        }
      },

      // update profile action - updates the user profile in the backend
      updateProfile: async (userData: Partial<User>) => {
        const { token } = get();
        
        if (!token) {
          set({ error: 'No authentication token available' });
          return;
        }
        
        try {
          set({ isLoading: true, error: null });
          
          
          
          const response = await fetch(AUTH_ENDPOINTS.UPDATE_PROFILE, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(userData)
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.error('Update profile response error:', errorData);
            throw new Error(errorData.error || 'Failed to update profile');
          }
          
          // re-fetch to get the updated profile data
          await get().fetchProfile();
        } catch (error: any) {
          console.error('Error in updateProfile action:', error);
          set({ 
            isLoading: false, 
            error: error.message || 'Failed to update profile'
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
            } catch (error: any) {
              console.error('Reauthentication error:', error);
              throw new Error('Current password is incorrect');
            }
          } else if (isGoogleUser) {
            // google users need to reauthenticate with Google
            const provider = new GoogleAuthProvider();
            try {
              await signInWithPopup(auth, provider);
            } catch (error: any) {
              console.error('Google reauthentication error:', error);
              throw new Error('Please reauthenticate with Google to change your password');
            }
          }
          
          // update firebase password
          try {
            await updatePassword(currentUser, newPassword);
          } catch (error: any) {
            if (error.code === 'auth/requires-recent-login') {
              throw new Error('For security reasons, please log out and log back in, then try changing your password again');
            }
            throw error;
          }
          
          // get fresh token after password change
          const freshToken = await currentUser.getIdToken(true);
          
          // update password in backend
          const response = await fetch(AUTH_ENDPOINTS.SET_PASSWORD, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`
            },
            body: JSON.stringify({ 
              password: newPassword,
              is_google_user: isGoogleUser 
            })
          });
          
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to update password');
          }
          
          set({ token: freshToken, isLoading: false });
        } catch (error: any) {
          set({ 
            isLoading: false, 
            error: error.message || 'Failed to set password'
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
      } catch (error: any) {
        set({ 
          isLoading: false, 
          error: error.message || 'Failed to refresh token'
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
          } catch (error: any) {
            console.error('Auth sync error:', error);
          }
        });
        // without this, the auth state listener will not be removed when the component unmounts
        // store the unsubscribe function in window to prevent memory leaks
        // @ts-ignore
        if (typeof window !== 'undefined') {
          // cleanup previous listener if exists
          // @ts-ignore
          if (window._authUnsubscribe) window._authUnsubscribe();
          // @ts-ignore
          window._authUnsubscribe = unsubscribe;
        }
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
  

  setInterval(() => {
    const { error, refreshToken } = useAuthStore.getState();
    if (error && error.includes('Token used too early')) {
      refreshToken();
    }
  }, 2000);
}
