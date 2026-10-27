// frontend/src/app/profile/page.tsx
'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store/authStore';
import PasswordSettings from '@/components/profile/PasswordSettings';

export default function ProfilePage() {
  const { user, fetchProfile, isLoading, error, updateProfile, fetchResearchInterests} = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [editMode, setEditMode] = useState(false);
  const [notification, setNotification] = useState({ message: '', isError: false, show: false });
  const [editableUser, setEditableUser] = useState({
    email: '',
    institution: '',
    bio: '',
    research_interests: [] as string[],
    first_name: '',
    last_name: ''
  });
  const [newInterest, setNewInterest] = useState('');
  const [availableInterests, setAvailableInterests] = useState<string[]>([]);
  const [filteredInterests, setFilteredInterests] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProfile();
    loadResearchInterests();
  }, [fetchProfile]);

  useEffect(() => {
    if (user) {
      setEditableUser({
        email: user.email,
        institution: user.institution || '',
        bio: user.bio || '',
        research_interests: user.research_interests || [],
        first_name: user.first_name || '',
        last_name: user.last_name || ''
      });
    }
  }, [user]);

  // Load research interests from the backend
  const loadResearchInterests = async () => {
    const interests = await fetchResearchInterests();
    setAvailableInterests(interests);
  };

  // Filter interests based on user input
  useEffect(() => {
    if (newInterest.trim() === '') {
      setFilteredInterests(availableInterests);
    } else {
      const filtered = availableInterests.filter(interest =>
        interest.toLowerCase().includes(newInterest.toLowerCase())
      );
      setFilteredInterests(filtered);
    }
  }, [newInterest, availableInterests]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (user) {
      setEditableUser({
        email: user.email,
        institution: user.institution || '',
        bio: user.bio || '',
        research_interests: user.research_interests || [],
        first_name: user.first_name || '',
        last_name: user.last_name || ''
      });
    }
    setEditMode(false);
  };

  const handleSave = async () => {
    try {
      
      await updateProfile(editableUser);
      
      setNotification({ message: 'Profile updated successfully!', isError: false, show: true });
      setEditMode(false);
      
      setTimeout(() => {
        setNotification(prev => ({ ...prev, show: false }));
      }, 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setNotification({ message: 'Failed to update profile.', isError: true, show: true });
    }
  };

  const addInterest = (interest: string = newInterest.trim()) => {
    if (interest && !editableUser.research_interests.includes(interest)) {
      setEditableUser({
        ...editableUser,
        research_interests: [...editableUser.research_interests, interest]
      });
      setNewInterest('');
      setShowDropdown(false);
    }
  };

  const removeInterest = (index: number) => {
    setEditableUser({
      ...editableUser,
      research_interests: editableUser.research_interests.filter((_, i) => i !== index)
    });
  };


  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(140deg, #111827 0%, #131f37 50%, #0f1729 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <div className="container max-w-5xl mx-auto py-10 px-6">
        <div className="flex mb-6 space-x-4 border-b border-gray-700/50 pb-2">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`pb-2 px-1 text-gray-300 ${activeTab === 'profile' ? 'border-b-2 border-blue-400 text-blue-300 font-medium' : 'hover:text-blue-300 transition-colors'}`}
          >
            Profile
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`pb-2 px-1 text-gray-300 ${activeTab === 'security' ? 'border-b-2 border-blue-400 text-blue-300 font-medium' : 'hover:text-blue-300 transition-colors'}`}
          >
            Security
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 text-red-200 rounded-md">
            {error}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800">
            {notification.show && (
              <div className={`p-4 mb-4 ${notification.isError ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-green-900/50 border-green-700 text-green-200'} rounded-t-xl border-b`}>
                {notification.message}
              </div>
            )}
            
            {user ? (
              <div className="space-y-4 p-6 text-gray-300">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-100">Profile</h2>
                  {!editMode && (
                    <button
                      onClick={handleEdit}
                      className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Edit Profile
                    </button>
                  )}
                </div>
                
                <p className="text-gray-300"><strong className="text-gray-200">Email:</strong> {user.email}</p>
                
                {!editMode ? (
                  <>
                    <p className="text-gray-300"><strong className="text-gray-200">First Name:</strong> {user.first_name || ''}</p>
                    <p className="text-gray-300"><strong className="text-gray-200">Last Name:</strong> {user.last_name || ''}</p>
                    <p className="text-gray-300"><strong className="text-gray-200">Institution:</strong> {user.institution || ''}</p>
                    <p className="text-gray-300"><strong className="text-gray-200">Bio:</strong> {user.bio || ''}</p>
                    <div className="text-gray-300">
                      <strong className="text-gray-200">Research Interests:</strong>
                      {user.research_interests && user.research_interests.length > 0 ? (
                        <ul className="list-disc pl-5 mt-2">
                          {user.research_interests.map((interest, index) => (
                            <li key={index} className="text-gray-300">{interest}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2">None specified</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">First Name</label>
                      <input
                        type="text"
                        value={editableUser.first_name}
                        onChange={(e) => setEditableUser({...editableUser, first_name: e.target.value})}
                        className="w-full p-2 bg-gray-800/80 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">Last Name</label>
                      <input
                        type="text"
                        value={editableUser.last_name}
                        onChange={(e) => setEditableUser({...editableUser, last_name: e.target.value})}
                        className="w-full p-2 bg-gray-800/80 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">Institution</label>
                      <input
                        type="text"
                        value={editableUser.institution}
                        onChange={(e) => setEditableUser({...editableUser, institution: e.target.value})}
                        className="w-full p-2 bg-gray-800/80 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">Bio</label>
                      <textarea
                        value={editableUser.bio}
                        onChange={(e) => setEditableUser({...editableUser, bio: e.target.value})}
                        className="w-full p-2 bg-gray-800/80 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={4}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">Research Interests</label>
                      <div className="relative" ref={dropdownRef}>
                        <div className="flex space-x-2 mb-2">
                          <input
                            type="text"
                            value={newInterest}
                            onChange={(e) => {
                              setNewInterest(e.target.value);
                              setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                            className="flex-1 p-2 bg-gray-800/80 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Add a research interest"
                          />
                          <button
                            type="button"
                            onClick={() => addInterest()}
                            className="py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          >
                            Add
                          </button>
                        </div>
                        
                        {showDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto text-gray-300">
                            {filteredInterests.length > 0 ? (
                              <ul>
                                {filteredInterests.slice(0, 5).map((interest, index) => (
                                  <li 
                                    key={index}
                                    className={`p-2 hover:bg-gray-700 cursor-pointer ${
                                      editableUser.research_interests.includes(interest) ? 'bg-blue-900/40' : ''
                                    }`}
                                    onClick={() => addInterest(interest)}
                                  >
                                    {interest}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="p-2 text-center text-gray-400">
                                No matching interests found. Type to add a new interest.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <ul className="space-y-2">
                        {editableUser.research_interests.map((interest, index) => (
                          <li key={index} className="flex items-center justify-between p-2 bg-gray-800/60 rounded-md border border-gray-700">
                            <span className="text-gray-300">{interest}</span>
                            <button
                              type="button"
                              onClick={() => removeInterest(index)}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                    
                    <div className="flex space-x-2 mt-6">
                      <button
                        type="button"
                        onClick={handleSave}
                        className="py-2 px-6 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="py-2 px-6 bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-gray-300">No user data found</div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <PasswordSettings />
        )}
      </div>
    </div>
  );
}