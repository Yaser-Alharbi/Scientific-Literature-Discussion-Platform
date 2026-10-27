'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

interface SignupFormProps {
  provider?: string | null;
  email?: string | null;
}

export default function SignupForm({ provider, email }: SignupFormProps) {
  const {
    register,
    registerGoogleUser,
    isLoading,
    error: authError,
    clearError,
  } = useAuthStore();

  const router = useRouter();

  const [formData, setFormData] = useState({
    email: email || '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false); // to prevent error flashes

  useEffect(() => {
    if (provider === 'google') {
      setIsGoogleUser(true);
      setFormData(prev => ({ ...prev, email: email || '' }));
    }
  }, [provider, email]);

  useEffect(() => {
    // set errors if not in success state
    if (authError && !isSuccess) {
      setError(authError);
    }
    return () => {
      clearError();
    };
  }, [authError, clearError, isSuccess]);

  // Handle Google signup
  const handleGoogleSignup = async () => {
    try {
      
      setIsSuccess(true);
      
      // register with Google
      await useAuthStore.getState().registerGoogleUser();

      //redirect to profile page 
      router.push('/profile?provider=google&newUser=true');
    } catch (error) {
      setIsSuccess(false);
      console.error(error);
      setError("Google authentication failed, please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous errors
    setError(null);
    clearError();
    
    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {

      setIsSuccess(true);
      
      // register user
      await register(formData.email, formData.password, { first_name: formData.firstName, last_name: formData.lastName });

      // Get the auth state to verify full authentication
      const { isAuthenticated, user } = useAuthStore.getState();
      
      if (isAuthenticated && user) {
        // Redirect to profile page
        router.push('/profile');
      } else {
        setIsSuccess(false);
      }
        
    } catch (err) {
      setIsSuccess(false);
      console.error(err);
    }
  };

  return (
    <div className="w-full p-8 space-y-6 bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 overflow-hidden relative">
      {/* Glow effects */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
      <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>
      
      <h2 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-blue-100 pb-2">
        Create Account
      </h2>

      {error && !isSuccess && (
        <div className="bg-red-900/30 border border-red-800/50 text-red-200 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Email"
            required
          />
        </div>

        <div>
          <input
            type="text"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="First Name"
            required
          />
        </div>

        <div>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Last Name"
            required
          />
        </div>

        <div>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Password"
            required
          />
        </div>

        <div>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder="Confirm Password"
            required
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-lg hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 transition-all duration-200 font-medium"
        >
          {isLoading ? 'Processing...' : 'Sign Up'}
        </button>
      </form>

      {/* "Or continue with" text and line */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-700"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-900/40 text-gray-400">Or continue with</span>
        </div>
      </div>

      {/* Google signup button */}
      <button
        onClick={handleGoogleSignup}
        disabled={isLoading}
        className="w-full border border-gray-700 p-3 rounded-lg flex items-center justify-center space-x-2 bg-gray-800/30 hover:bg-gray-800/50 disabled:opacity-70 transition-all duration-200"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
        <span className="text-gray-300">{isLoading ? 'Processing...' : 'Sign up with Google'}</span>
      </button>

      {/* Login link */}
      <div className="text-center text-sm text-gray-400">
        <Link href="/Login" className="text-blue-300 hover:text-blue-200 transition-colors">
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );
}