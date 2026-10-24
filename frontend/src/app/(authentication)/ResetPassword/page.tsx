'use client';
import { useState, useEffect } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    async function verifyCode() {
      // get the parameters from URL
      const mode = searchParams?.get('mode');
      const code = searchParams?.get('oobCode');
      
      
      if (mode === 'resetPassword' && code) {
        setOobCode(code);
        
        try {
          // get email from Firebase using the reset code
          setVerifying(true);
          const emailFromCode = await verifyPasswordResetCode(auth, code);
          setEmail(emailFromCode);
          setVerifying(false);
        } catch (err: any) {
          console.error('Error verifying reset code:', err);
          setError('Invalid or expired reset code. Please request a new reset link.');
          setVerifying(false);
        }
      } else {
        setError('Invalid request type or missing code');
        console.error('Invalid parameters:', { mode, code });
        setVerifying(false);
      }
    }
    
    verifyCode();
  }, [searchParams]);
  
  const validatePasswords = () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      console.error('Password validation failed: passwords do not match');
      return false;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      console.error('Password validation failed: password too short');
      return false;
    }
    return true;
  };
  
  const syncPasswordWithBackend = async (newPassword: string, userEmail: string) => {
    try {
      // log in to get a fresh token
      const userCredential = await signInWithEmailAndPassword(auth, userEmail, newPassword);
      const token = await userCredential.user.getIdToken();
      
      // call backend to sync the password
      const response = await fetch(`${API_URL}/api/sync-reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: userEmail,
          password: newPassword
        })
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('Backend sync failed:', responseData);
        throw new Error('Failed to sync password with server');
      }
      
      return true;
    } catch (error: any) {
      console.error('Password sync error:', error);
      return false;
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePasswords() || !oobCode) {
      console.error('Form validation failed');
      return;
    }
    
    if (!email) {
      console.error('Email is required but missing');
      setError('Email address could not be verified. Please try requesting a new reset link.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. update password in Firebase
      await confirmPasswordReset(auth, oobCode, password);
      
      // 2. sync with backend
      const syncSuccess = await syncPasswordWithBackend(password, email);
      
      if (syncSuccess) {
        setSuccess(true);
        // redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/');
        }, 3000);
      } else {
        console.error('Backend sync failed after successful Firebase reset');
        setError('Password reset in Firebase succeeded but failed to sync with our system. Please contact support.');
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center relative" style={{
      background: 'linear-gradient(140deg, #111827 0%, #131f37 50%, #0f1729 100%)',
      backgroundAttachment: 'fixed'
    }}>
      {/* Grid pattern background */}
      <div className="absolute inset-0 opacity-3" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%236b7280' fill-opacity='0.2'%3E%3Cpath opacity='.3' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: '24px 24px'
      }}></div>
      
      {/* Molecular pattern overlay */}
      <div className="absolute inset-0 opacity-3" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 800 800'%3E%3Cg fill='none' stroke='%23404040' stroke-width='1'%3E%3Cpath d='M769 229L1037 260.9M927 880L731 737 520 660 309 538 40 599 295 764 126.5 879.5 40 599-197 493 102 382-31 229 126.5 79.5-69-63'/%3E%3Cpath d='M-31 229L237 261 390 382 603 493 308.5 537.5 101.5 381.5M370 905L295 764'/%3E%3Cpath d='M520 660L578 842 731 737 840 599 603 493 520 660 295 764 309 538 390 382 539 269 769 229 577.5 41.5 370 105 295 -36 126.5 79.5 237 261 102 382 40 599 -69 737 127 880'/%3E%3Cpath d='M520-140L578.5 42.5 731-63M603 493L539 269 237 261 370 105M902 382L539 269M390 382L102 382'/%3E%3Cpath d='M-222 42L126.5 79.5 370 105 539 269 577.5 41.5 927 80 769 229 902 382 603 493 731 737M295-36L577.5 41.5M578 842L295 764M40-201L127 80M102 382L-261 269'/%3E%3C/g%3E%3Cg fill='%23303030'%3E%3Ccircle cx='769' cy='229' r='5'/%3E%3Ccircle cx='539' cy='269' r='5'/%3E%3Ccircle cx='603' cy='493' r='5'/%3E%3Ccircle cx='731' cy='737' r='5'/%3E%3Ccircle cx='520' cy='660' r='5'/%3E%3Ccircle cx='309' cy='538' r='5'/%3E%3Ccircle cx='295' cy='764' r='5'/%3E%3Ccircle cx='40' cy='599' r='5'/%3E%3Ccircle cx='102' cy='382' r='5'/%3E%3Ccircle cx='127' cy='80' r='5'/%3E%3Ccircle cx='370' cy='105' r='5'/%3E%3Ccircle cx='578' cy='42' r='5'/%3E%3Ccircle cx='237' cy='261' r='5'/%3E%3Ccircle cx='390' cy='382' r='5'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: '120% 120%',
        backgroundPosition: 'center'
      }}></div>
      
      <div className="relative z-10 container mx-auto px-4 w-full max-w-md">
        {verifying ? (
          <div className="w-full p-8 space-y-6 bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 overflow-hidden relative text-center">
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-blue-100 pb-2">Verifying Reset Link</h1>
            <div className="flex justify-center">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
            </div>
          </div>
        ) : (
          <div className="w-full p-8 space-y-6 bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 overflow-hidden relative">
            {/* Glow effects */}
            <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
            <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>
            
            <h1 className="text-2xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-blue-100 pb-2">
              Set New Password
            </h1>
            
            {error && (
              <div className="bg-red-900/30 border border-red-800/50 text-red-200 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            {success ? (
              <div className="text-center">
                <div className="bg-green-900/30 border border-green-800/50 text-green-200 p-3 rounded-lg">
                  Password has been reset successfully! You'll be redirected to the home page.
                </div>
                <Link href="/" className="mt-4 inline-block text-blue-300 hover:text-blue-200 transition-colors">
                  Go to home page now
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {email && (
                  <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <p className="text-sm text-gray-300">
                      Resetting password for: <span className="font-medium text-gray-100">{email}</span>
                    </p>
                  </div>
                )}
                
                <div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    minLength={8}
                  />
                </div>
                
                <div>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                    minLength={8}
                  />
                </div>
                
                <button 
                  type="submit"
                  disabled={isLoading || !oobCode || !email}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-lg hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 transition-all duration-200 font-medium"
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}