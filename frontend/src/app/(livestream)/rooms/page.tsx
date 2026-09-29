'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLivestreamStore } from '@/store/livestreamStore';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';





export default function RoomsPage() {
  const [roomTitle, setRoomTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInterest, setSearchInterest] = useState('');
  const [filteredInterests, setFilteredInterests] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // New state for search and filtering
  const [titleSearch, setTitleSearch] = useState('');
  const [filterInterests, setFilterInterests] = useState<string[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<any[]>([]);
  const [interestFilterSearch, setInterestFilterSearch] = useState('');
  const [filteredAvailableInterests, setFilteredAvailableInterests] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  
  // Add state to track initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  const { 
    fetchRooms, 
    availableRooms, 
    isLoadingRooms, 
    createRoom,
    fetchResearchInterests,
    availableInterests,
    isLoadingInterests
  } = useLivestreamStore();
  
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  
  // Initial load of rooms and research interests
  useEffect(() => {
    console.log('Fetching available rooms');
    fetchRooms().then(() => {
      setInitialLoadComplete(true);
    });
    loadResearchInterests();
  }, [fetchRooms]);
  
  // auto-refresh for rooms
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('Auto-refreshing rooms');
      // prevent flash
      requestAnimationFrame(() => {
        fetchRooms();
      });
    }, 3000);
    
    // Clean up when component unmounts
    return () => clearInterval(intervalId);
  }, [fetchRooms]);
  
  // Set default filter interests from user's own research interests
  useEffect(() => {
    if (user?.research_interests && user.research_interests.length > 0) {
      setFilterInterests(user.research_interests);
    }
  }, [user?.research_interests]);

  // Filter available rooms based on title search and research interests
  useEffect(() => {
    if (!availableRooms) return;
    
    // Debounce the filtering to prevent ui flash
    const debounceTimeout = setTimeout(() => {
      let filtered = [...availableRooms];
      
      // Filter by title
      if (titleSearch.trim()) {
        filtered = filtered.filter(room => 
          room.title.toLowerCase().includes(titleSearch.toLowerCase())
        );
      }
      
      // Filter by research interests
      if (filterInterests.length > 0) {
        filtered = filtered.filter(room => {
          if (!room.research_interests || room.research_interests.length === 0) return false;
          
          // Check if room has at least one of the filtered interests
          return room.research_interests.some(interest => 
            filterInterests.includes(interest)
          );
        });
      }
      
      setFilteredRooms(filtered);
    }, 150); // Short delay
    
    return () => clearTimeout(debounceTimeout);
  }, [availableRooms, titleSearch, filterInterests]);
  
  // Filter available interests for the filter search
  useEffect(() => {
    if (!availableInterests) return;
    
    // Filter out already selected interests
    const unselectedInterests = availableInterests.filter(
      interest => !filterInterests.includes(interest)
    );
    
    if (interestFilterSearch.trim() === '') {
      setFilteredAvailableInterests(unselectedInterests);
    } else {
      const filtered = unselectedInterests.filter(interest =>
        interest.toLowerCase().includes(interestFilterSearch.toLowerCase())
      );
      setFilteredAvailableInterests(filtered);
    }
  }, [interestFilterSearch, availableInterests, filterInterests]);
  
  // Close filter panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setShowFilterPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Load research interests from the backend
  const loadResearchInterests = async () => {
    try {
      await fetchResearchInterests();
    } catch (error) {
      console.error('Failed to load research interests:', error);
    }
  };

  // Filter interests based on user input
  useEffect(() => {
    if (searchInterest.trim() === '') {
      setFilteredInterests(availableInterests);
    } else {
      const filtered = availableInterests.filter(interest =>
        interest.toLowerCase().includes(searchInterest.toLowerCase())
      );
      setFilteredInterests(filtered);
    }
  }, [searchInterest, availableInterests]);

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
  
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !user) {
      setError('You must be logged in to create a room');
      console.error('Cannot create room: User not logged in');
      return;
    }
    
    if (!roomTitle.trim()) {
      setError('Room title is required');
      console.error('Cannot create room: Title is empty');
      return;
    }
    
    try {
      setIsCreating(true);
      setError(null);
      console.log(`Creating room with title: ${roomTitle} and interests: ${selectedInterests.join(', ')}`);
      
      const room = await createRoom(roomTitle, selectedInterests);
      
      if (room) {
        console.log(`Room created or found successfully:`, room);
        router.push(`/room/${room.room_id}`);
      } else {
        setError('Failed to create or find room');
        console.error('Room creation returned null result');
      }
    } catch (err: any) {
      // Special case for when a user already has a room but we couldn't find it
      if (err.message && err.message.includes('already have an active room')) {
        setError('You already have an active room. Please find it in the list below or delete it first.');
        
        // Refresh the room list to help them find their room
        fetchRooms();
      } else {
        setError(err.message || 'Failed to create room');
      }
      console.error('Error creating room:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const addInterest = (interest: string) => {
    if (interest && !selectedInterests.includes(interest)) {
      setSelectedInterests([...selectedInterests, interest]);
      setSearchInterest('');
      setShowDropdown(false);
    }
  };

  const removeInterest = (interest: string) => {
    setSelectedInterests(selectedInterests.filter(item => item !== interest));
  };
  
  // Toggle filter interest
  const toggleFilterInterest = (interest: string) => {
    if (filterInterests.includes(interest)) {
      setFilterInterests(filterInterests.filter(item => item !== interest));
    } else {
      setFilterInterests([...filterInterests, interest]);
    }
  };
  
  // Clear all filter interests
  const clearFilterInterests = () => {
    setFilterInterests([]);
  };
  
  return (
    <div className="min-h-screen flex flex-col relative" style={{
      background: 'linear-gradient(140deg, #111827 0%, #131f37 50%, #0f1729 100%)',
      backgroundAttachment: 'fixed'
    }}>
      {/* Grid pattern background */}
      <div className="absolute inset-0 opacity-3" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%236b7280' fill-opacity='0.2'%3E%3Cpath opacity='.3' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: '24px 24px'
      }}></div>
      
      {/* Molecular pattern overlay */}
      <div className="absolute inset-0 opacity-3" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 800 800'%3E%3Cg fill='none' stroke='%23404040' stroke-width='1'%3E%3Cpath d='M769 229L1037 260.9M927 880L731 737 520 660 309 538 40 599 295 764 126.5 879.5 40 599-197 493 102 382-31 229 126.5 79.5-69-63'/%3E%3Cpath d='M-31 229L237 261 390 382 603 493 308.5 537.5 101.5 381.5M370 905L295 764'/%3E%3Cpath d='M520 660L578 842 731 737 840 599 603 493 520 660 295 764 309 538 390 382 539 269 769 229 577.5 41.5 370 105 295 -36 126.5 79.5 237 261 102 382 40 599 -69 737 127 880'/%3E%3Cpath d='M520-140L578.5 42.5 731-63M603 493L539 269 237 261 370 105M902 382L539 269M390 382L102 382'/%3E%3Cpath d='M-222 42L126.5 79.5 370 105 539 269 577.5 41.5 927 80 769 229 902 382 603 493 731 737M295-36L577.5 41.5M578 842L295 764M40-201L127 80M102 382L-261 269'/%3E%3C/g%3E%3Cg fill='%23303030'%3E%3Ccircle cx='769' cy='229' r='5'/%3E%3Ccircle cx='539' cy='269' r='5'/%3E%3Ccircle cx='603' cy='493' r='5'/%3E%3Ccircle cx='731' cy='737' r='5'/%3E%3Ccircle cx='520' cy='660' r='5'/%3E%3Ccircle cx='309' cy='538' r='5'/%3E%3Ccircle cx='295' cy='764' r='5'/%3E%3Ccircle cx='40' cy='599' r='5'/%3E%3Ccircle cx='102' cy='382' r='5'/%3E%3Ccircle cx='127' cy='80' r='5'/%3E%3Ccircle cx='370' cy='105' r='5'/%3E%3Ccircle cx='578' cy='42' r='5'/%3E%3Ccircle cx='237' cy='261' r='5'/%3E%3Ccircle cx='390' cy='382' r='5'/%3E%3C/g%3E%3C/svg%3E")`,
        backgroundSize: '120% 120%',
        backgroundPosition: 'center'
      }}></div>
      
      <div className="container mx-auto px-4 py-8 relative z-10 flex flex-col flex-grow">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 via-gray-100 to-blue-200 pb-2 inline-block">
            LiveStream Rooms
          </h1>
          <div className="h-1 w-40 bg-gradient-to-r from-blue-600/50 via-indigo-600/70 to-blue-600/50 mx-auto rounded-full mt-1"></div>
          <p className="text-gray-400 text-base mt-3">Create a new room or join an existing one to start livestreaming</p>
        </div>
        
        <div className="bg-gray-900/40 backdrop-blur-md rounded-xl p-6 shadow-lg border border-gray-800 overflow-hidden relative mb-8">
          {/* Glow effects */}
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
          <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>
          
          <h2 className="text-xl font-semibold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-indigo-200 inline-block">Create a New Room</h2>
          <form onSubmit={handleCreateRoom} className="flex flex-col">
            <div className="mb-4">
              <label htmlFor="roomTitle" className="block text-sm font-medium mb-2 text-gray-300">
                Room Title
              </label>
              <input
                type="text"
                id="roomTitle"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                className="w-full p-3 bg-gray-800/80 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter room title"
                disabled={isCreating}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-300">
                Research Interests
              </label>
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  value={searchInterest}
                  onChange={(e) => {
                    setSearchInterest(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full p-3 bg-gray-800/80 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Search research interests"
                  disabled={isCreating}
                />
                
                {showDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredInterests.length > 0 ? (
                      <ul>
                        {filteredInterests.slice(0, 5).map((interest, index) => (
                          <li 
                            key={index}
                            className={`p-2 hover:bg-gray-700 cursor-pointer ${
                              selectedInterests.includes(interest) ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white' : ''
                            }`}
                            onClick={() => addInterest(interest)}
                          >
                            {interest}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="p-2 text-center">
                        No matching interests found.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedInterests.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Selected Interests
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedInterests.map((interest, index) => (
                    <div key={index} className="flex items-center bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1 rounded-full">
                      <span>{interest}</span>
                      <button
                        type="button"
                        onClick={() => removeInterest(interest)}
                        className="ml-2 text-sm hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800/50 text-red-200 rounded-md text-sm">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isCreating || !roomTitle.trim()}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
          </form>
        </div>
        
        <div className="bg-gray-900/40 backdrop-blur-md rounded-xl p-6 shadow-lg border border-gray-800 overflow-hidden relative flex-grow flex flex-col">
          {/* Glow effects */}
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>
          <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
          
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-indigo-200 inline-block">Available Rooms</h2>
          </div>
          
          {/* Search and filter controls */}
          <div className="flex gap-4 mb-6">
            {/* Room title search */}
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={titleSearch}
                  onChange={(e) => setTitleSearch(e.target.value)}
                  className="w-full p-3 bg-gray-800/80 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pl-10"
                  placeholder="Search rooms by title..."
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
              </div>
            </div>
            
            {/* Filter by interests dropdown */}
            <div className="relative" ref={filterPanelRef}>
              <button
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className="flex items-center gap-2 p-3 bg-gray-800/80 border border-gray-700 rounded-lg hover:bg-gray-700/80 transition-colors"
              >
                <span className="text-gray-300">
                  {filterInterests.length > 0 
                    ? `Interests (${filterInterests.length})` 
                    : 'Filter by interests'}
                </span>
                <svg 
                  className={`w-4 h-4 text-gray-400 transition-transform ${showFilterPanel ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
        
              {/* Filter panel */}
              {showFilterPanel && (
                <div className="absolute right-0 z-50 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
                  <div className="p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-300">Research Interests</span>
                      <button 
                        onClick={clearFilterInterests}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Clear All
                      </button>
                    </div>
                    
                    {/* Search interests */}
                    <div className="relative mb-2">
                      <input
                        type="text"
                        value={interestFilterSearch}
                        onChange={(e) => setInterestFilterSearch(e.target.value)}
                        className="w-full p-2 bg-gray-700/80 border border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm pl-8"
                        placeholder="Search interests..."
                      />
                      <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                      </div>
                    </div>
                    
                    {/* Available interests*/}
                    <div className="max-h-40 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {filteredAvailableInterests.length > 0 ? (
                          filteredAvailableInterests.map((interest, idx) => (
                            <div 
                              key={idx}
                              onClick={() => toggleFilterInterest(interest)}
                              className="cursor-pointer text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600"
                            >
                              {interest}
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-400 text-xs w-full text-center py-2">
                            {interestFilterSearch ? 'No matching interests' : 'No more interests available'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Selected filter badges */}
          {filterInterests.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">Filtering by:</span>
              {filterInterests.map((interest, idx) => (
                <div 
                  key={idx}
                  className="flex items-center bg-gradient-to-r from-blue-600/80 to-indigo-600/80 text-xs px-2 py-0.5 rounded-full"
                >
                  <span className="text-xs">{interest}</span>
                  <button
                    onClick={() => toggleFilterInterest(interest)}
                    className="ml-1 text-xs hover:text-red-300"
                  >
                    ×

                  </button>
                </div>
              )).slice(0, 6)}
              {filterInterests.length > 6 && (
                <div className="flex items-center bg-gray-700/80 text-xs px-2 py-0.5 rounded-full">
                  <span className="text-xs">+{filterInterests.length - 6} more</span>
                </div>
              )}
            </div>
          )}
          
          {/* Room content */}
          <div className="flex-grow overflow-y-auto">
            {isLoadingRooms && !initialLoadComplete ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Loading rooms...</p>
              </div>
            ) : filteredRooms.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">No matching rooms found. Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRooms.map((room) => (
                  <div key={room.id} className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-5 relative border border-gray-700 hover:border-gray-600 transition-colors">
                    <h3 className="font-medium mb-2 text-blue-300">{room.title}</h3>
                    <h4 className="font-medium mb-2 text-gray-300">Host: {room.hostName}</h4>
                    
                    {room.research_interests && room.research_interests.length > 0 && (
                      <div className="my-2">
                        <p className="text-sm text-gray-400 mb-1">Research Interests:</p>
                        <div className="flex flex-wrap gap-1">
                          {room.research_interests.map((interest: string, idx: number) => (
                            <span key={idx} className="bg-gradient-to-r from-blue-900 to-indigo-900 text-xs px-2 py-1 rounded-full">
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm text-gray-400">
                        Activity: {room.numParticipants || 0} total participant/s have joined this room
                      </span>   
                      <button
                        onClick={() => router.push(`/room/${room.room_id}`)}
                        className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all duration-200"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 