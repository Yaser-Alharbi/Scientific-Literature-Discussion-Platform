// frontend/src/components/profile/PasswordSettings.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

export default function PasswordSettings() {

  const setPassword = useAuthStore(state => state.setPassword);
  const isLoading = useAuthStore(state => state.isLoading);
  const error = useAuthStore(state => state.error);
  const clearError = useAuthStore(state => state.clearError);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const fetchProfile = useAuthStore(state => state.fetchProfile);
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  
  const [successMessage, setSuccessMessage] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [formTouched, setFormTouched] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const hasPasswordSet = 
    user?.password_set || 
    (user?.auth_methods && user.auth_methods.includes('EMAIL'));

  
  useEffect(() => {
    if (localError && error) {
      clearError();
    }
  }, [localError, error, clearError]);

  const refreshUserData = async () => {
    setIsRefreshing(true);
    try {
      await fetchProfile();
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const dismissError = () => {
    setLocalError(null);
    clearError();
  };

  const dismissSuccess = () => {
    setSuccessMessage('');
  };

  const handlePasswordChange = (field: string, value: string) => {
    // clear messages if submitting the form
    setFormTouched(true);
    setPasswords({...passwords, [field]: value});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // clear previous messages when submitting
    setLocalError(null);
    clearError();
    setSuccessMessage('');
    setFormTouched(true);
    

    try {
      // client-side validation
      if (passwords.new !== passwords.confirm) {
        const errorMsg = 'New passwords do not match';
        setLocalError(errorMsg);
        return;
      }

      // validate current password if user has a password set
      if (hasPasswordSet && passwords.new === passwords.current) {
        const errorMsg = 'New password must be different from current password';
        setLocalError(errorMsg);
        return;
      }

      if (!isAuthenticated) {
        const errorMsg = 'You must be logged in';
        setLocalError(errorMsg);
        return;
      }

      //authStore's setPassword with the current password (only if password is set)
      await setPassword(passwords.new, hasPasswordSet ? passwords.current : undefined);

      setSuccessMessage(hasPasswordSet ? 'Password updated successfully' : 'Password created successfully');
      setPasswords({ current: '', new: '', confirm: '' });
      
      // refresh the profile data after successful password change
      await refreshUserData();
    } catch (error) {
      console.error('Password update error:', error);
      
      setLocalError(error instanceof Error && error.message ? error.message : 'Failed to update password');
    }
  };

  // displayed error is either from the store or local validation
  const displayError = localError || error;

  return (
    <div className="bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-100">
          {!hasPasswordSet ? 'Create Password' : 'Password Settings'}
        </h3>
        <button 
          onClick={refreshUserData} 
          disabled={isRefreshing}
          className="text-sm text-blue-300 hover:text-blue-200 transition-colors"
        >
          {/* {isRefreshing ? 'Refreshing...' : 'Refresh'} */}
        </button>
      </div>
      
      {displayError && (
        <div className="p-3 mb-4 rounded-md bg-red-900/50 text-red-200 border border-red-700 relative">
          {displayError}
          <button 
            onClick={dismissError}
            className="absolute top-1 right-2 text-red-400 hover:text-red-300 transition-colors" 
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      
      {successMessage && (
        <div className="p-3 mb-4 rounded-md bg-green-900/50 text-green-200 border border-green-700 relative">
          {successMessage}
          <button 
            onClick={dismissSuccess}
            className="absolute top-1 right-2 text-green-400 hover:text-green-300 transition-colors" 
            aria-label="Dismiss success message"
          >
            ×
          </button>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Only show current password field if user has password set */}
        {hasPasswordSet && (
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={passwords.current}
              onChange={e => handlePasswordChange('current', e.target.value)}
              className="mt-1 block w-full bg-gray-800/80 border border-gray-700 rounded-md shadow-sm p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
        )}
        
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-1">
            {!hasPasswordSet ? 'Create Password' : 'New Password'}
          </label>
          <input
            type="password"
            value={passwords.new}
            onChange={e => handlePasswordChange('new', e.target.value)}
            className="mt-1 block w-full bg-gray-800/80 border border-gray-700 rounded-md shadow-sm p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            minLength={6}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-1">
            Confirm {!hasPasswordSet ? 'Password' : 'New Password'}
          </label>
          <input
            type="password"
            value={passwords.confirm}
            onChange={e => handlePasswordChange('confirm', e.target.value)}
            className="mt-1 block w-full bg-gray-800/80 border border-gray-700 rounded-md shadow-sm p-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
            minLength={6}
          />
        </div>
        
        <button
          type="submit"
          disabled={isLoading || isRefreshing}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
        >
          {isLoading ? 'Processing...' : (!hasPasswordSet ? 'Create Password' : 'Update Password')}
        </button>
      </form>
    </div>
  );
}