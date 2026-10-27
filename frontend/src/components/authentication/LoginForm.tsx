'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore'; 
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  
  // Get auth store state and actions
  const { 
    login, 
    googleLogin,
    isAuthenticated, 
    isLoading, 
    error: storeError, 
    clearError,
    token,
    user
  } = useAuthStore();
  
  const [localError, setLocalError] = useState('');
  
  // Clear errors when component mounts/unmounts
  useEffect(() => {
    clearError();
    return () => clearError();
  }, [clearError]);
  
  // Handle successful login with redirection to the home page
  useEffect(() => {
    // redirect if authenticated AND if there is a user object
    // redirect only happens if django auth was successful not only firebase auth
    if (isAuthenticated && token && user) {
      router.push('/');
    }
  }, [isAuthenticated, token, user, router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    
    try {
      await login(credentials.email, credentials.password);
      
      // the store throws when login fails; on success the effect above redirects once isAuthenticated is true
    } catch (error: any) {
      setLocalError('Login failed. Please try again.');
    }
  };

  const handleGoogleLogin = async () => {
    setLocalError('');
    
    try {
      //auth store googleLogin function
      await googleLogin();
    } catch (error: any) {
      console.error('Google login error:', error);
      setLocalError('Google login failed. Please try again.');
    }
  };

  // displays errors from the store or local state
  const displayError = storeError || localError;

  return (
    <div className="w-full max-w-md p-8 space-y-6 bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 overflow-hidden relative">
      {/* Glow effects */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
      <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>
      
      <h1 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-blue-100 pb-2">
        Log in to your account
      </h1>

      {/* Error message */}
      {displayError && (
        <div className="bg-red-900/30 border border-red-800/50 text-red-200 p-3 rounded-lg text-sm">
          {displayError}
        </div>
      )}
      
      {/* Email login form */}
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={credentials.email}
          onChange={e => setCredentials({...credentials, email: e.target.value})}
          className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          disabled={isLoading}
          required
        />
        
        {/* Password input */}
        <input
          type="password"
          placeholder="Password"
          value={credentials.password}
          onChange={e => setCredentials({...credentials, password: e.target.value})}
          className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          disabled={isLoading}
          required
        />

        {/* Forgot password link */}
        <div className="text-center text-sm">
          <Link href="/ForgotPassword" className="text-blue-300 hover:text-blue-200 transition-colors">
            Forgot your password?
          </Link>
        </div>

        {/* Login button */}
        <button 
          type="submit"
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-lg hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 transition-all duration-200 font-medium"
          disabled={isLoading}
        >
          {isLoading ? 'Logging in...' : 'Login'}
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

      {/* Google login button */}
      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="w-full border border-gray-700 p-3 rounded-lg flex items-center justify-center space-x-2 bg-gray-800/30 hover:bg-gray-800/50 disabled:opacity-70 transition-all duration-200"
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
        <span className="text-gray-300">{isLoading ? 'Processing...' : 'Log in with Google'}</span>
      </button>

      {/* Signup link */}
      <div className="text-center text-sm text-gray-400">
        <Link href="/Signup" className="text-blue-300 hover:text-blue-200 transition-colors">
          Don't have an account? Sign up
        </Link>
      </div>
    </div>
  );
}