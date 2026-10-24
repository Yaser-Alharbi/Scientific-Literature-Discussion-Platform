'use client';

import {
  ControlBar,
  RoomAudioRenderer,
  Chat,
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  useChat,
  useParticipants,
  useRoomContext,
  LayoutContextProvider,
} from '@livekit/components-react';
import { Participant, Track, Room as LiveKitRoomType } from 'livekit-client';
import '@livekit/components-styles';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useLivestreamStore } from '@/store/livestreamStore';
import { usePaperStore } from '@/store/paperStore';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';

interface RoomParticipant {
  id: string | number;
  userId: string | number;
  username: string;
  role: string;
  joinedAt: string;
  lastActive: string;
  isCurrentUser: boolean;
}

const RoleBadge = ({ role }: { role: string | null }) => {
  if (!role) return null;
  
  const getBadgeColor = (role: string) => {
    switch (role) {
      case 'host':
        return 'bg-red-600';
      case 'guest':
        return 'bg-green-600';
      default:
        return 'bg-gray-600';
    }
  };
  
  return (
    <span className={`${getBadgeColor(role)} text-white text-xs font-medium px-2.5 py-0.5 rounded-full uppercase`}>
      {role}
    </span>
  );
};

const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ParticipantIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const ReferencesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

function MyVideoConference() {
  const participants = useParticipants();
  const room = useRoomContext();
  const { currentUserRole } = useLivestreamStore();
  
  useEffect(() => {
  }, [room?.localParticipant, currentUserRole]);
  
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Microphone, withPlaceholder: true },
    ],
    { 
      onlySubscribed: true
    }
  );
  
  const filteredTracks = tracks.filter(track => {
    const participant = track.participant;
    
    if (participant.isLocal) {
      return currentUserRole === 'host' || currentUserRole === 'guest';
    }
    
    try {
      const roomId = room.name;
      
      const { availableRooms, participants: storeParticipants } = useLivestreamStore.getState();
      const roomData = availableRooms.find(r => r.room_id === roomId);
      const hostId = roomData?.hostId;
      
      if (currentUserRole === 'host') {
        if (hostId && participant.identity === hostId) {
          return true;
        }
        
        const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
        if (metadata.role === 'host' || metadata.role === 'guest') {
          return true;
        }
        
        const dbParticipant = storeParticipants.find(p => {
          return p.userId.toString() === participant.identity || 
                 p.username === participant.name || 
                 p.username === participant.identity;
        });
        
        if (dbParticipant && (dbParticipant.role === 'guest' || dbParticipant.role === 'host')) {
          return true;
        }
      }
      
      if (hostId && participant.identity === hostId) {
        return true;
      }
      
      const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
      const participantRole = metadata.role;
      
      if (participantRole === 'host') {
        return true;
      }
      
      return false;
      
    } catch (e) {
      console.error('Error in video filter:', e);
      return false;
    }
  });
  
  if (filteredTracks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white">
        No video streams available
      </div>
    );
  }
  
  return (
    <GridLayout 
      tracks={filteredTracks}
      style={{ 
        height: '100%',
        width: '100%',
      }}
    >
      <ParticipantTile />
    </GridLayout>
  );
}

function CustomChat() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { chatMessages, send, isSending } = useChat();
  const [inputValue, setInputValue] = useState('');
  const participants = useParticipants();
  const room = useRoomContext();

  const getParticipantName = (identity: string) => {
    const participant = participants.find(p => p.identity === identity);
    if (participant) return participant.name || participant.identity;
    if (room.localParticipant.identity === identity) return room.localParticipant.name || 'You';
    return identity;
  };
  
  const formatTime = (timestamp: any) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    try {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      send(inputValue);
      setInputValue('');
    }
  };
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  return (
    <div className="flex flex-col h-full">
      <div 
        ref={chatContainerRef}
        className="flex-grow overflow-y-auto px-4 py-2 space-y-2 pb-20"
      >
        {chatMessages.map((msg) => {
          const key = typeof msg.timestamp === 'object' && msg.timestamp instanceof Date
            ? msg.timestamp.getTime()
            : typeof msg.timestamp === 'string' || typeof msg.timestamp === 'number'
              ? new Date(msg.timestamp).getTime()
              : Math.random().toString();
              
          return (
            <div key={key} className="group flex flex-col mb-2">
              <div className="flex items-start">
                <div className="font-medium text-sm text-white w-24 truncate">
                  {getParticipantName(msg.from?.identity || 'unknown')}
                </div>
                <div className="ml-2 px-3 py-1 bg-gray-800 rounded-lg text-white text-sm flex-grow">
                  {msg.message}
                </div>
              </div>
              <div className="text-xs text-gray-500 ml-24 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(msg.timestamp)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="p-2 border-t border-gray-700">
        <form onSubmit={handleSubmit} className="flex">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow bg-gray-800 text-white rounded-l-md px-3 py-2 focus:outline-none"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending || !inputValue.trim()}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded-r-md px-4 py-2 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function ParticipantsList() {
  const participants = useParticipants();
  const currentUser = useRoomContext().localParticipant;
  const router = useParams();
  const roomId = router?.roomId as string;
  const [isPromoting, setIsPromoting] = useState<Record<string, boolean>>({});
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      useLivestreamStore.getState().fetchParticipants(roomId);
      setLastRefresh(Date.now());
    }, 3000);
    
    return () => clearInterval(refreshInterval);
  }, [roomId]);

  const groupedParticipants = {
    hosts: [] as Participant[],
    moderators: [] as Participant[],
    guests: [] as Participant[],
    viewers: [] as Participant[]
  };

  const storeData = useLivestreamStore.getState();
  const room = storeData.availableRooms.find(r => r.room_id === roomId);
  const hostId = room?.hostId;
  const userRole = storeData.currentUserRole;
  const { updateParticipantRole } = useLivestreamStore();
  
  const handleRoleChange = async (participant: Participant, newRole: 'guest' | 'viewer') => {
    await useLivestreamStore.getState().fetchParticipants(roomId);
    
    const dbParticipants = useLivestreamStore.getState().participants;
    const username = participant.name || participant.identity;
    
    let dbParticipant = null;
    
    dbParticipant = dbParticipants.find(p => p.username === username);
    
    if (!dbParticipant) {
      dbParticipant = dbParticipants.find(p => 
        p.username.toLowerCase() === username.toLowerCase()
      );
    }
    
    if (!dbParticipant) {
      dbParticipant = dbParticipants.find(p => p.userId.toString() === participant.identity);
    }
    
    if (!dbParticipant) {
      const substringMatches = dbParticipants.filter(p => 
        p.username.includes(username) || username.includes(p.username)
      );
      
      if (substringMatches.length === 1) {
        dbParticipant = substringMatches[0];
      } else if (substringMatches.length > 1) {
        dbParticipant = substringMatches[0];
      }
    }
    
    if (!dbParticipant) {
      console.error(`Could not find participant ${username} in database after trying all methods`);
      return;
    }
    
    setIsPromoting(prev => ({ ...prev, [participant.identity]: true }));
    
    try {
      const success = await updateParticipantRole(roomId, dbParticipant.id, newRole);
      
      if (success) {
        await useLivestreamStore.getState().fetchParticipants(roomId);
        setLastRefresh(Date.now());
        
        try {
          const livekitRoom = (window as any).__lk_room;
          if (livekitRoom) {
            const livekitParticipant = [...livekitRoom.participants.values()].find(
              (p: any) => p.identity === participant.identity
            );
            
            if (livekitParticipant) {
              const metadata = JSON.stringify({ role: newRole });
              await livekitParticipant.setMetadata(metadata);
              
              window.dispatchEvent(new CustomEvent('livekit:metadata_changed', { 
                detail: { participant: livekitParticipant, prevMetadata: '{}' }
              }));
              
              try {
                const encoder = new TextEncoder();
                const payload = encoder.encode(JSON.stringify({
                  type: 'role_update',
                  role: newRole,
                  forceRefresh: true,
                  timestamp: Date.now()
                }));
                
                livekitRoom.localParticipant.publishData(payload, {
                  destinationIdentities: [participant.identity],
                  reliable: true
                });
                
                const broadcastPayload = encoder.encode(JSON.stringify({
                  type: 'refresh_participants',
                  changedParticipantId: participant.identity,
                  newRole: newRole,
                  timestamp: Date.now()
                }));
                
                livekitRoom.localParticipant.publishData(broadcastPayload, {
                  reliable: true
                });
              } catch (e) {
                console.error('Error sending role update message:', e);
              }
            }
          }
        } catch (e) {
          console.error('Error updating LiveKit metadata:', e);
        }
      } else {
        console.error(`Failed to update ${dbParticipant.username} to ${newRole}`);
      }
    } finally {
      setIsPromoting(prev => ({ ...prev, [participant.identity]: false }));
    }
  };
  
  const getParticipantRole = (participant: Participant) => {
    if (participant.isLocal) {
      return userRole || 'viewer';
    }
    
    if (hostId && participant.identity === hostId) {
      return 'host';
    }
    
    try {
      if (participant.metadata) {
        const metadata = JSON.parse(participant.metadata);
        if (metadata.role) {
          return metadata.role;
        }
      }
    } catch (e) {
      // If parsing fails, continue with default
    }
    
    const dbParticipants = storeData.participants;
    const username = participant.name || participant.identity;
    const dbParticipant = dbParticipants.find(p => p.username === username);
    if (dbParticipant) {
      return dbParticipant.role;
    }
    
    return 'viewer';
  };

  groupedParticipants.hosts = [];
  groupedParticipants.moderators = [];
  groupedParticipants.guests = [];
  groupedParticipants.viewers = [];
  
  participants.forEach(participant => {
    const role = getParticipantRole(participant);
    
    if (role === 'host') {
      groupedParticipants.hosts.push(participant);
    } else if (role === 'moderator') {
      groupedParticipants.moderators.push(participant);
    } else if (role === 'guest') {
      groupedParticipants.guests.push(participant);
    } else {
      groupedParticipants.viewers.push(participant);
    }
  });

  let isCurrentUserAdded = false;
  
  Object.keys(groupedParticipants).forEach(roleGroup => {
    const index = groupedParticipants[roleGroup as keyof typeof groupedParticipants]
      .findIndex(p => p.identity === currentUser.identity);
    
    if (index !== -1) {
      groupedParticipants[roleGroup as keyof typeof groupedParticipants].splice(index, 1);
      isCurrentUserAdded = true;
    }
  });
  
  if (userRole === 'host') {
    groupedParticipants.hosts.push(currentUser);
  } else if (userRole === 'moderator') {
    groupedParticipants.moderators.push(currentUser);
  } else if (userRole === 'guest') {
    groupedParticipants.guests.push(currentUser);
  } else {
    groupedParticipants.viewers.push(currentUser);
  }

  const renderParticipantGroup = (title: string, participants: Participant[]) => {
    return (
      <div className="mb-4">
        <h3 className="text-gray-500 text-xs uppercase font-semibold mb-2 px-4">{title} ({participants.length})</h3>
        {participants.length > 0 ? (
          <ul>
            {participants.map(participant => (
              <li 
                key={participant.identity} 
                className="flex items-center px-4 py-2 hover:bg-gray-800"
              >
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mr-3">
                  <span className="text-sm text-white">
                    {participant.name?.charAt(0).toUpperCase() || participant.identity.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-grow">
                  <div className="text-white text-sm font-medium">
                    {participant.name || participant.identity}
                    {participant.identity === currentUser.identity && " (You)"}
                  </div>
                </div>
                
                {userRole === 'host' && participant.identity !== currentUser.identity && (
                  <div className="flex">
                    {title === 'Viewers' && (
                      <button
                        onClick={() => handleRoleChange(participant, 'guest')}
                        disabled={isPromoting[participant.identity]}
                        className="text-xs bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded"
                      >
                        {isPromoting[participant.identity] ? 'Inviting...' : 'Invite to Guests'}
                      </button>
                    )}
                    {title === 'Guests' && (
                      <button
                        onClick={() => handleRoleChange(participant, 'viewer')}
                        disabled={isPromoting[participant.identity]}
                        className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white py-1 px-2 rounded"
                      >
                        {isPromoting[participant.identity] ? 'Demoting...' : 'Demote to Viewers'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-gray-400 text-xs px-4">No participants</div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <div className="text-gray-400 text-sm mb-4">
          {participants.length + (isCurrentUserAdded ? 0 : 1)} participants in this room
        </div>
        
        {renderParticipantGroup("Hosts", groupedParticipants.hosts)}
        {renderParticipantGroup("Guests", groupedParticipants.guests)}
        {renderParticipantGroup("Viewers", groupedParticipants.viewers)}
      </div>
    </div>
  );
}

function ReferencesTab() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const [showModal, setShowModal] = useState(false);
  const [selectedExtract, setSelectedExtract] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const extractsEndRef = useRef<HTMLDivElement>(null);
  const { currentUserRole } = useLivestreamStore();
  const { fetchUserExtracts, userExtracts, loadingExtracts } = usePaperStore();
  const { 
    currentSharedExtract, 
    sharedExtracts, 
    shareExtractInRoom, 
    fetchSharedExtracts, 
    isLoadingExtracts 
  } = useLivestreamStore();
  
  // periodic refresh of shared extracts from the backend
  useEffect(() => {
    // Initial fetch from backend
    fetchSharedExtracts(roomId);
    
    // Interval to refresh every 5 seconds
    const refreshInterval = setInterval(() => {
      fetchSharedExtracts(roomId);
      setLastRefresh(Date.now());
    }, 5000);
    
    return () => clearInterval(refreshInterval);
  }, [roomId, fetchSharedExtracts]);
  
  // Scroll to the bottom when extracts change
  useEffect(() => {
    if (extractsEndRef.current) {
      extractsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sharedExtracts]);
  
  const handleOpenModal = async () => {
    await fetchUserExtracts();
    setShowModal(true);
  };
  
  const handleSelectExtract = (extract: any) => {
    setSelectedExtract(extract);
  };
  
  const handleShareExtract = async () => {
    if (!selectedExtract) return;
    
    try {

      
      // Format for extract data for sharing
      const extractToShare = {
        id: selectedExtract.id,
        title: selectedExtract.title,
        authors: selectedExtract.authors,
        doi: selectedExtract.doi,
        link: selectedExtract.link || selectedExtract.publication_link || '',
        pdf_link: selectedExtract.pdf_link || '',
        publication_link: selectedExtract.publication_link || selectedExtract.link || '',
        extract: selectedExtract.extract,
        page_number: selectedExtract.page_number || null,
      };
      
      
      // Share the extract through the backend API
      const success = await shareExtractInRoom(roomId, extractToShare);
      
      if (success) {
        // Then broadcast a notification to other participants via LiveKit data channel
        const livekitRoom = (window as any).__lk_room;
        if (livekitRoom?.localParticipant) {
          const encoder = new TextEncoder();
          const payload = encoder.encode(JSON.stringify({
            type: 'extract_shared',
            roomId: roomId,
            timestamp: Date.now()
          }));
          
          livekitRoom.localParticipant.publishData(payload, {
            reliable: true
          });
        }
        
        // Close modal and trigger refresh
        setShowModal(false);
        setSelectedExtract(null);
        fetchSharedExtracts(roomId);
      }
    } catch (error) {
      console.error('Error sharing extract:', error);
    }
  };
  
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };
  
  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch (e) {
      return '';
    }
  };
  
  const canShareExtracts = currentUserRole === 'host' || currentUserRole === 'guest';
  
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 flex-grow overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white text-lg font-semibold">Shared References</h3>
          {canShareExtracts && (
            <button
              onClick={handleOpenModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
            >
              Select Extract to Present
            </button>
          )}
        </div>
        
        {isLoadingExtracts && sharedExtracts.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            Loading references...
          </div>
        ) : sharedExtracts.length === 0 ? (
          <div className="text-center text-gray-400 py-10">
            No references have been shared yet
          </div>
        ) : (
          <div className="space-y-6">
            {sharedExtracts.map((extract, index) => {
              // Check for a date separator
              const showDateHeader = index === 0 || 
                formatDate(extract.shared_at) !== formatDate(sharedExtracts[index-1].shared_at);
              
              return (
                <div key={`${extract.id}-${index}`}>
                  {showDateHeader && (
                    <div className="text-center text-gray-500 text-xs py-2">
                      {formatDate(extract.shared_at)}
                    </div>
                  )}
                  <div className="bg-gray-800 rounded-lg p-4 text-white">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <a 
                          href={extract.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline text-lg font-medium"
                        >
                          {extract.title}
                        </a>
                        {extract.doi && (
                          <div className="text-gray-400 text-xs mt-1">
                            DOI: {extract.doi}
                          </div>
                        )}
                      </div>

                    </div>
                    
                    <div className="mt-3 text-sm bg-gray-700 p-3 rounded leading-relaxed">
                      {extract.extract}
                    </div>
                    
                    <div className="mt-2">
                      <div className="text-gray-300 text-sm mb-1">
                        Page: {extract.page_number || 'N/A'}
                      </div>
                      {extract.pdf_link ? (
                        <a
                          href={extract.pdf_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm inline-flex items-center"
                        >
                          <span>Open PDF</span>
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">No PDF available</span>
                      )}
                    </div>
                    
                    <div className="mt-3 text-xs flex justify-between">
                      <div className="text-gray-400">
                        Shared by: {extract.shared_by}
                      </div>
                      <div className="text-gray-400">
                        {formatTime(extract.shared_at)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={extractsEndRef} />
            
            {isLoadingExtracts && (
              <div className="text-center text-gray-500 text-xs py-2">
                Refreshing...
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Extract Selection Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white text-lg font-semibold">Select an Extract to Share</h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white"
              >
                &times;
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
              {loadingExtracts ? (
                <div className="text-center text-gray-400 py-10">Loading extracts...</div>
              ) : userExtracts.length === 0 ? (
                <div className="text-center text-gray-400 py-10">
                  You don't have any saved extracts yet
                </div>
              ) : (
                <div className="space-y-3">
                  {userExtracts.map((extract) => (
                    <div 
                      key={extract.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedExtract?.id === extract.id 
                          ? 'bg-blue-900 border-blue-600' 
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                      }`}
                      onClick={() => handleSelectExtract(extract)}
                    >
                      <div className="font-medium text-white">{extract.title}</div>
                      <div className="text-gray-400 text-sm mt-1">
                        {extract.extract.length > 100 
                          ? extract.extract.substring(0, 100) + '...' 
                          : extract.extract}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-4 pt-3 border-t border-gray-700">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded mr-2"
              >
                Cancel
              </button>
              <button
                onClick={handleShareExtract}
                disabled={!selectedExtract}
                className={`px-4 py-2 rounded ${
                  !selectedExtract 
                    ? 'bg-blue-900 text-gray-300 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                Share with Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string || 'quickstart-room';
  
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'references'>('chat');
  
  const hasAttemptedFetch = useRef(false);
  
  const [error, setError] = useState<string | null>(null);
  
  const { user, isAuthenticated } = useAuthStore();
  
  const { 
    token,
    isConnecting,
    joinRoom,
    leaveRoom,
    currentUserRole,
    fetchParticipants,
    fetchRooms
  } = useLivestreamStore();

  const [roleUpdateTrigger, setRoleUpdateTrigger] = useState(0);
  
  useEffect(() => {
    if (!token) return;
    
    const handleDataReceived = (payload: any, participant: any) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(payload));
        
        if (data.type === 'refresh_participants') {
          useLivestreamStore.getState().fetchParticipants(roomId);
          return;
        }
        
        if (data.type === 'role_update') {
          if (data.role) {
            useLivestreamStore.getState().setCurrentUserRole(data.role);
            
            useLivestreamStore.getState().fetchParticipants(roomId).then(() => {
              setRoleUpdateTrigger(prev => prev + 1);
              
              const reconnectToRoom = async () => {
                try {
                  const authState = useAuthStore.getState();
                  if (!authState.user) return;
                  
                  const currentToken = useLivestreamStore.getState().token;
                  
                  useLivestreamStore.getState().setConnectionStatus(true, false);
                  useLivestreamStore.getState().setToken('');
                  
                  setTimeout(() => {
                    useLivestreamStore.getState().setToken(currentToken);
                    useLivestreamStore.getState().setConnectionStatus(false, true);
                    
                    if ((window as any).__lk_room) {
                      (window as any).__lk_room._refreshPermissions = true;
                    }
                    
                    setTimeout(() => {
                      setRoleUpdateTrigger(prev => prev + 1);
                    }, 1000);
                  }, 300);
                } catch (err) {
                  console.error('Error refreshing room connection:', err);
                }
              };
              
              reconnectToRoom();
            });
          }
        }
        
        // Extract notification handlers
        if (data.type === 'extract_shared' || data.type === 'request_extract_refresh') {
          // Refresh extracts from the backend
          useLivestreamStore.getState().fetchSharedExtracts(roomId);
        }
      } catch (e) {
        console.error('Error handling data message:', e);
      }
    };
    
    const registerDataListener = setInterval(() => {
      const livekitRoom = (window as any).__lk_room;
      if (!livekitRoom) return;
      
      if (!livekitRoom._hasDataListener) {
        livekitRoom.on('dataReceived', handleDataReceived);
        livekitRoom._hasDataListener = true;
      }
    }, 1000);
    
    return () => {
      clearInterval(registerDataListener);
      
      const livekitRoom = (window as any).__lk_room;
      if (livekitRoom && livekitRoom._hasDataListener) {
        livekitRoom.off('dataReceived', handleDataReceived);
      }
    };
  }, [token, roomId]);

  const joinRoomWithUserInfo = useCallback(() => {
    if (hasAttemptedFetch.current) {
      return;
    }
    
    (async () => {
      try {
        setError(null);
        hasAttemptedFetch.current = true;
        
        if (isAuthenticated) {
          await fetchParticipants(roomId);
          const { participants } = useLivestreamStore.getState();
          const currentUser = useAuthStore.getState().user;
          
          let existingParticipant = null;
          if (currentUser?.email) {
            existingParticipant = participants.find(p => {
              return p.isCurrentUser || 
                    p.username === currentUser.email ||
                    p.username.toLowerCase() === currentUser.email.toLowerCase();
            });
          }
          
          if (existingParticipant) {
            useLivestreamStore.getState().setCurrentUserRole(existingParticipant.role);
          }
        }
        
        await fetchRooms();
        
        const currentUser = useAuthStore.getState().user;
        let username = 'guest-user';
        
        if (currentUser?.email) {
          username = currentUser.email;
        } else {
        }
        
        const authUser = useAuthStore.getState().user;
        const rooms = useLivestreamStore.getState().availableRooms;
        
        let userRole = useLivestreamStore.getState().currentUserRole || 'viewer';
        
        if (userRole === 'viewer' || !userRole) {
          const room = rooms.find(r => r.room_id === roomId);
          
          if (room && authUser && room.hostId === authUser.email) {
            userRole = 'host';
          } else if (room && room.hostId) {
            userRole = userRole || 'viewer';
          } else {
            userRole = userRole || 'viewer';
          }
        }
        
        const newToken = await joinRoom(roomId, username, userRole);
        
        if (!newToken) {
          throw new Error('Failed to get token');
        }
      } catch (err: any) {
        console.error('Error getting token:', err);
        
        let errorMessage = err.message || 'Failed to get token';
        
        if (err.cause?.details) {
          errorMessage += `: ${err.cause.details}`;
        }
        
        if (errorMessage.includes('misconfigured')) {
          errorMessage = 'Server configuration error: LiveKit API keys missing. Please check server setup.';
        } else if (errorMessage.includes('500')) {
          errorMessage = 'Server error: Token generation failed. Check browser console for details.';
        }
        
        setError(errorMessage);
      }
    })();
  }, [roomId, joinRoom, isAuthenticated, fetchParticipants]);

  const handleLeaveRoom = () => {
    if (currentUserRole === 'host') {
      const { currentRoomId, deleteRoom } = useLivestreamStore.getState();
      if (currentRoomId) {
        deleteRoom(currentRoomId).catch(err => {
          console.error('Error deleting room:', err);
        });
      }
    }
    
    leaveRoom();
    router.push('/rooms');
  };
  
  const reloadLiveKitConnection = useCallback(() => {
    if (!token || !currentUserRole) return;
    
    setRoleUpdateTrigger(prev => prev + 1);
    
    fetchParticipants(roomId);
  }, [token, currentUserRole, roomId, fetchParticipants]);


  const handleDeviceError = (error: { source: Track.Source; error: Error }) => {
    console.error(`Device error with ${error.source}:`, error.error);
  };
  
  useEffect(() => {
    if (!token || !currentUserRole) return;
    
    fetchParticipants(roomId);
    
    const livekitRoom = (window as any).__lk_room;
    if (livekitRoom?.localParticipant) {
      try {
        const currentMetadata = JSON.parse(livekitRoom.localParticipant.metadata || '{}');
        if (!currentMetadata.role || currentMetadata.role !== currentUserRole) {
          const metadata = JSON.stringify({ role: currentUserRole });
          livekitRoom.localParticipant.setMetadata(metadata)
            .catch((err: any) => console.error('Error updating metadata:', err));
        }
      } catch (e) {
        console.error('Error processing metadata:', e);
      }
    }
  }, [token, currentUserRole, roomId, fetchParticipants]);

  const toggleChat = () => {
    if (!isChatVisible) {
      setActiveTab('chat');
    }
    setIsChatVisible(!isChatVisible);
  };

  useEffect(() => {
    setTimeout(() => {
      joinRoomWithUserInfo();
    }, 300);
    
    return () => {
      if (hasAttemptedFetch.current) {
        leaveRoom();
      }
    };
  }, [roomId, joinRoomWithUserInfo]);
  
  useEffect(() => {
    if (!token || !currentUserRole) return;
    
    const metadataInterval = setInterval(() => {
      const roomContext = document.querySelector('[data-lk-theme]');
      if (!roomContext) return;
      
      const livekitRoom = (window as any).__lk_room;
      
      if (livekitRoom?.localParticipant) {
        let needsMetadataUpdate = false;
        
        try {
          const currentMetadata = JSON.parse(livekitRoom.localParticipant.metadata || '{}');
          if (!currentMetadata.role || currentMetadata.role !== currentUserRole) {
            needsMetadataUpdate = true;
          }
        } catch (e) {
          needsMetadataUpdate = true;
        }
        
        if (needsMetadataUpdate) {
          const newMetadata = JSON.stringify({ role: currentUserRole });
          
          livekitRoom.localParticipant.setMetadata(newMetadata)
            .catch((err: any) => console.error('Error updating metadata:', err));
        }
      }
    }, 2000);
    
    return () => clearInterval(metadataInterval);
  }, [token, currentUserRole]);
  
  useEffect(() => {
    if (!token) return;
    
    const handleMetadataChanged = async () => {
      if (roomId) {
        await useLivestreamStore.getState().fetchParticipants(roomId);
        
        const { participants } = useLivestreamStore.getState();
        const authState = useAuthStore.getState();
        
        if (authState.user?.email) {
          const myParticipant = participants.find(p => {
            return p.isCurrentUser || 
                   p.username === authState.user?.email ||
                   p.username.toLowerCase() === authState.user?.email.toLowerCase();
          });
          
          if (myParticipant && myParticipant.role !== currentUserRole) {
            useLivestreamStore.getState().setCurrentUserRole(myParticipant.role);
          }
        }
      }
    };
    
    window.addEventListener('livekit:metadata_changed', handleMetadataChanged);
    
    const metadataCheckInterval = setInterval(() => {
      const livekitRoom = (window as any).__lk_room;
      if (!livekitRoom) return;
      
      if (!livekitRoom._hasMetadataListener) {
        livekitRoom.on('participantMetadataChanged', (participant: any, prevMetadata: string) => {
          window.dispatchEvent(new CustomEvent('livekit:metadata_changed', { 
            detail: { participant, prevMetadata }
          }));
        });
        livekitRoom._hasMetadataListener = true;
      }
    }, 1000);
    
    return () => {
      window.removeEventListener('livekit:metadata_changed', handleMetadataChanged);
      clearInterval(metadataCheckInterval);
    };
  }, [token, roomId, currentUserRole]);

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    
    const { participants, currentUserRole } = useLivestreamStore.getState();
    
    if (currentUserRole) return;
    
    let currentUser = participants.find((p: RoomParticipant) => p.username === user.email);
    
    if (!currentUser) {
      currentUser = participants.find((p: RoomParticipant) => 
        p.username.toLowerCase() === user.email.toLowerCase()
      );
    }
    
    if (!currentUser && roomId) {
      useLivestreamStore.getState().fetchParticipants(roomId);
    }
    
    if (currentUser) {
      useLivestreamStore.getState().setCurrentUserRole(currentUser.role);
    }
    
    const unsubscribe = useLivestreamStore.subscribe((state) => {
      if (!user?.email) return;
      
      if (state.currentUserRole) return;
      
      let foundUser = state.participants.find((p: RoomParticipant) => p.username === user.email);
      
      if (!foundUser) {
        foundUser = state.participants.find((p: RoomParticipant) => 
          p.username.toLowerCase() === user.email.toLowerCase()
        );
      }
      
      if (foundUser) {
        useLivestreamStore.getState().setCurrentUserRole(foundUser.role);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [user?.email, isAuthenticated, roomId]);

  const RoleHeader = () => {
    const { availableRooms } = useLivestreamStore.getState();
    const room = availableRooms.find(r => r.room_id === roomId) || { title: 'Unknown' };
    
    return (
    <div className="bg-black bg-opacity-70 p-2 flex justify-between items-center border-b border-gray-800">
      <div className="flex items-center space-x-2">
        <span className="text-white text-sm">Your role:</span>
        <RoleBadge role={currentUserRole} />
        
        {currentUserRole === 'guest' && (
          <span className="text-gray-400 text-xs ml-2">
            (You can use mic, camera, and screen share)
          </span>
        )}
      </div>
      <div className="text-white text-lg font-bold justify-center">{room.title}</div>
      <div className="text-white text-sm">Room ID: {roomId}</div>
    </div>
    );
  };

  if (error) {
    return (
      <div className="flex flex-col h-screen bg-black">
        <RoleHeader />
        <div className="flex items-center justify-center flex-grow">
          <div className="text-center">
            <div className="text-xl text-red-500 mb-4">Error: {error}</div>
            <button 
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
              onClick={() => {
                hasAttemptedFetch.current = false;
                window.location.reload();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col h-screen bg-black">
        <RoleHeader />
        <div className="flex items-center justify-center flex-grow">
          <div className="text-lg text-white">Getting token... {isConnecting ? '(in progress)' : ''}</div>
        </div>
      </div>
    );
  }

  const liveKitKey = `livekit-${currentUserRole}-${roleUpdateTrigger || 0}`;
  
  return (
    <LiveKitRoom 
      key={liveKitKey}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ''} 
      token={token}
      connect={true}
      audio={false}
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true
      }}
      onDisconnected={handleLeaveRoom}
      onConnected={() => {
        const livekitRoom = (document.querySelector('[data-lk-theme]') as any)?.__lkRoom;
        if (livekitRoom) {
          (window as any).__lk_room = livekitRoom;
          
          try {
            if (livekitRoom.localParticipant) {
              const metadata = JSON.stringify({ role: currentUserRole });
              livekitRoom.localParticipant.setMetadata(metadata)
                .catch((err: Error) => console.error('Error setting initial metadata:', err));
              
              setTimeout(() => {
                fetchParticipants(roomId);
              }, 1000);
            }
          } catch (e) {
            console.error('Error setting initial metadata:', e);
          }
        }
      }}
    >
      <LayoutContextProvider>
        <div data-lk-theme="default" className="flex flex-col h-screen w-full bg-black">
          <RoleHeader />
          <div className="flex flex-grow overflow-hidden relative">
            <div className={`flex flex-col ${isChatVisible ? 'w-3/4' : 'w-full'} transition-all duration-300 h-full`}>
              <div className="flex-grow pb-20">
                <MyVideoConference />
              </div>
              
              {(currentUserRole === 'host' || currentUserRole === 'guest') && (
                <div className="fixed bottom-4 left-0 right-0 z-10 flex justify-start items-center ml-6">
                  <div className="flex items-center bg-gray-900/90 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-gray-700">
                    <ControlBar 
                      className="!p-0"
                      style={{
                        display: 'flex',
                        background: 'transparent',
                        border: 'none',
                        boxShadow: 'none',
                        padding: 0
                      }}
                      variation="verbose"
                      controls={{
                        microphone: true,
                        camera: true,
                        screenShare: currentUserRole === 'host' || currentUserRole === 'guest',
                        chat: false,
                        leave: true,
                        settings: false
                      }}
                      onDeviceError={handleDeviceError}
                    />
                    
                    <button 
                      className="lk-button ml-4 flex items-center justify-center gap-2"
                      onClick={toggleChat}
                    >
                      <ChatIcon />
                      <span>Chat</span>
                    </button>
                    
                  </div>
                </div>
              )}
              
              {currentUserRole === 'viewer' && (
                <div className="fixed bottom-4 left-0 right-0 z-10 flex justify-start items-center ml-6">
                  <div className="flex items-center bg-gray-900/90 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg border border-gray-700">
                    <button 
                      className="lk-button flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleLeaveRoom}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                      </svg>
                      <span>Leave Room</span>
                    </button>
                    
                    <button 
                      className="lk-button ml-4 flex items-center justify-center gap-2"
                      onClick={toggleChat}
                    >
                      <ChatIcon />
                      <span>Chat</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div 
              className={`transition-all duration-300 border-l border-gray-800 flex flex-col bg-gray-900 h-full ${
                isChatVisible ? 'w-1/4' : 'w-0 border-l-0 overflow-hidden'
              }`}
            >
              <div className="p-3 bg-gray-950 border-b border-gray-800 flex justify-between items-center">
                <div className="flex">
                  <button 
                    className={`text-white font-medium px-3 py-1 rounded-t-md flex items-center ${activeTab === 'chat' ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                    onClick={() => setActiveTab('chat')}
                  >
                    <ChatIcon /> <span className="ml-1">Chat</span>
                  </button>
                  <button 
                    className={`text-white font-medium px-3 py-1 ml-2 rounded-t-md flex items-center ${activeTab === 'participants' ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                    onClick={() => setActiveTab('participants')}
                  >
                    <ParticipantIcon /> <span className="ml-1">Participants</span>
                  </button>
                  <button 
                    className={`text-white font-medium px-3 py-1 ml-2 rounded-t-md flex items-center ${activeTab === 'references' ? 'bg-gray-800' : 'hover:bg-gray-800/50'}`}
                    onClick={() => setActiveTab('references')}
                  >
                    <ReferencesIcon /> <span className="ml-1">References</span>
                  </button>
                </div>
                <button 
                  onClick={toggleChat}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>
              <div className="flex-grow overflow-hidden pb-16">
                {activeTab === 'chat' ? (
                  <CustomChat />
                ) : activeTab === 'participants' ? (
                  <ParticipantsList />
                ) : (
                  <ReferencesTab />
                )}
              </div>
            </div>
          </div>
          <RoomAudioRenderer />
        </div>
      </LayoutContextProvider>
    </LiveKitRoom>  
  );
} 