import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';
import { api } from '@/lib/api';
import { auth } from '@/lib/firebase';

interface Room {
  id: string;
  room_id: string;
  title: string;
  numParticipants?: number;
  hostId?: string;
  hostName?: string;
  research_interests?: string[];
}

interface Participant {
  id: string;
  userId: string;
  username: string;
  role: string;
  joinedAt: string;
  lastActive: string;
  isCurrentUser: boolean;
}

interface SharedExtract {
  id: string;
  title: string;
  authors: string;
  doi?: string;
  link: string;
  pdf_link?: string;
  publication_link?: string;
  extract: string;
  shared_by: string;
  shared_at: string;
  page_number?: string;
}

interface LivestreamState {
  // Room state
  currentRoomId: string | null;
  availableRooms: Room[];
  isLoadingRooms: boolean;
  
  // Participants state
  participants: Participant[];
  currentUserRole: string | null;
  isLoadingParticipants: boolean;
  
  // Connection state
  token: string;
  isConnecting: boolean;
  isConnected: boolean;
  
  // Research interests
  availableInterests: string[];
  isLoadingInterests: boolean;
  
  // Shared extract state
  currentSharedExtract: SharedExtract | null;
  sharedExtracts: SharedExtract[];
  isLoadingExtracts: boolean;
  
  // Actions
  setCurrentRoom: (roomId: string | null) => void;
  setToken: (token: string) => void;
  setConnectionStatus: (isConnecting: boolean, isConnected: boolean) => void;
  setAvailableRooms: (rooms: Room[]) => void;
  setLoadingRooms: (isLoading: boolean) => void;
  setParticipants: (participants: Participant[]) => void;
  setCurrentUserRole: (role: string | null) => void;
  setLoadingParticipants: (isLoading: boolean) => void;
  setAvailableInterests: (interests: string[]) => void;
  setLoadingInterests: (isLoading: boolean) => void;
  setCurrentSharedExtract: (extract: SharedExtract | null) => void;
  addSharedExtract: (extract: SharedExtract) => void;
  clearSharedExtracts: () => void;
  setLoadingExtracts: (isLoading: boolean) => void;
  setSharedExtracts: (extracts: SharedExtract[]) => void;
  
  // Room operations
  fetchRooms: () => Promise<void>;
  fetchParticipants: (roomId: string) => Promise<void>;
  createRoom: (title: string, research_interests: string[]) => Promise<Room | null>;
  joinRoom: (roomId: string, username: string, role?: string) => Promise<string | null>;
  leaveRoom: () => void;
  deleteRoom: (roomId: string) => Promise<boolean>;
  updateParticipantRole: (roomId: string, participantId: string, newRole: string) => Promise<boolean>;
  fetchResearchInterests: () => Promise<string[]>;
  shareExtractInRoom: (roomId: string, extractData: any) => Promise<boolean>;
  fetchSharedExtracts: (roomId: string) => Promise<void>;
}

// API endpoints - Using environment variables for deployment flexibility
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const API_BASE = `${API_BASE_URL}/api/livestream`;

// token endpoint is a Next.js API route, not a Django endpoint
const API_ENDPOINTS = {
  TOKEN: `/api/token`,
  ROOMS: `${API_BASE}/rooms`,
  CREATE_ROOM: `${API_BASE}/rooms/create`,
  DELETE_ROOM: (roomId: string) => `${API_BASE}/rooms/${roomId}/delete`,
  PARTICIPANTS: (roomId: string) => `${API_BASE}/rooms/${roomId}/participants/`,
  UPDATE_PARTICIPANT_ROLE: (roomId: string, participantId: string) => 
    `${API_BASE}/rooms/${roomId}/participants/${participantId}/role/`,
  SHARE_EXTRACT: (roomId: string) => `${API_BASE}/rooms/${roomId}/share-extract/`,
  ROOM_EXTRACTS: (roomId: string) => `${API_BASE}/rooms/${roomId}/shared-extracts/`,
}

export const useLivestreamStore = create<LivestreamState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentRoomId: null,
      availableRooms: [],
      isLoadingRooms: false,
      participants: [],
      currentUserRole: null,
      isLoadingParticipants: false,
      token: '',
      isConnecting: false,
      isConnected: false,
      availableInterests: [],
      isLoadingInterests: false,
      currentSharedExtract: null,
      sharedExtracts: [],
      isLoadingExtracts: false,
      
      // Actions to update state
      setCurrentRoom: (roomId) => {
        set({ currentRoomId: roomId });
      },
      
      setToken: (token) => {
        set({ token });
      },
      
      setConnectionStatus: (isConnecting, isConnected) => {
        set({ isConnecting, isConnected });
      },
      
      setAvailableRooms: (rooms) => {
        set({ availableRooms: rooms });
      },
      
      setLoadingRooms: (isLoading) => {
        set({ isLoadingRooms: isLoading });
      },
      
      setParticipants: (participants) => {
        set({ participants });
      },
      
      setCurrentUserRole: (role) => {
        set({ currentUserRole: role });
      },
      
      setLoadingParticipants: (isLoading) => {
        set({ isLoadingParticipants: isLoading });
      },
      
      setAvailableInterests: (interests) => {
        set({ availableInterests: interests });
      },
      
      setLoadingInterests: (isLoading) => {
        set({ isLoadingInterests: isLoading });
      },
      
      setCurrentSharedExtract: (extract) => {
        set({ currentSharedExtract: extract });
      },
      
      addSharedExtract: (extract) => {
        // for if extract already exists to avoid duplicates
        const { sharedExtracts } = get();
        const exists = sharedExtracts.some(e => e.id === extract.id && e.shared_at === extract.shared_at);
        
        if (!exists) {
          set((state) => ({ 
            sharedExtracts: [...state.sharedExtracts, extract],
            currentSharedExtract: extract 
          }));
        }
      },
      
      clearSharedExtracts: () => {
        set({ sharedExtracts: [], currentSharedExtract: null });
      },
      
      setLoadingExtracts: (isLoading) => {
        set({ isLoadingExtracts: isLoading });
      },
      
      setSharedExtracts: (extracts) => {
        // Sort extracts by shared_at timestamp
        const sortedExtracts = [...extracts].sort((a, b) => 
          new Date(a.shared_at).getTime() - new Date(b.shared_at).getTime()
        );
        
        set({ 
          sharedExtracts: sortedExtracts,
          currentSharedExtract: sortedExtracts.length > 0 ? sortedExtracts[sortedExtracts.length - 1] : null
        });
      },
      
      // Room operations
      fetchRooms: async () => {
        const { setLoadingRooms, setAvailableRooms } = get();
        
        try {
          setLoadingRooms(true);
          const response = await fetch(API_ENDPOINTS.ROOMS);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch rooms: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // Format rooms to the expected structure
          setAvailableRooms(data);
        } catch (error) {
          console.error('Error fetching rooms:', error);
        } finally {
          setLoadingRooms(false);
        }
      },
      
      fetchParticipants: async (roomId) => {
        const { setLoadingParticipants, setParticipants, setCurrentUserRole } = get();
        
        try {
          setLoadingParticipants(true);
          const response = await fetch(API_ENDPOINTS.PARTICIPANTS(roomId));
          
          if (!response.ok) {
            throw new Error(`Failed to fetch participants: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          setParticipants(data.participants);
          
          // Make sure currentUserRole is set - either from the API or by finding it
          if (data.currentUserRole) {
            setCurrentUserRole(data.currentUserRole);
          } else if (data.participants?.length > 0) {
            // Find current user in participants
            const authState = useAuthStore.getState();
            const currentUser = data.participants.find((p: Participant) => 
              p.isCurrentUser === true || 
              (authState.user?.email && p.username === authState.user.email)
            );
            
            if (currentUser) {
              setCurrentUserRole(currentUser.role);
            }
          }
          
          return data;
        } catch (error) {
          console.error('Error fetching participants:', error);
        } finally {
          setLoadingParticipants(false);
        }
      },
      
      createRoom: async (title: string, research_interests: string[] = []) => {
        try {
          // Get the fresh token from Firebase
          // Force token refresh to ensure we have the latest token
          const currentUser = auth?.currentUser;
          if (!currentUser) {
            throw new Error('Not authenticated');
          }
          
          // Force a token refresh
          const freshToken = await currentUser.getIdToken(true);
          if (!freshToken) {
            throw new Error('Failed to get authentication token');
          }
          
          // Update token in authStore
          useAuthStore.getState().refreshToken();
          
          const response = await fetch(API_ENDPOINTS.CREATE_ROOM, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`
            },
            body: JSON.stringify({ 
              name: title,
              research_interests: research_interests 
            }),
          });
          
          // Handle the "already has a room" error as a special case
          if (response.status === 400) {
            const errorData = await response.json();
            
            // Check if it's the specific error about already having an active room
            if (errorData.error && errorData.error.includes('already have an active room')) {
              // Find the user's active room by refreshing the room list
              await get().fetchRooms();
              
              // Find the room owned by this user
              const authState = useAuthStore.getState();
              const userRooms = get().availableRooms.filter(room => 
                room.hostId === authState.user?.email // Using email as ID since that's what we have
              );
              
              if (userRooms.length > 0) {
                return userRooms[0]; // Return the first active room
              }
              
              // If we couldn't find their room, throw a more specific error
              throw new Error('You already have an active room');
            }
            
            throw new Error(`Failed to create room: ${errorData.error || 'Unknown error'}`);
          }
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create room: ${response.status} ${response.statusText} - ${errorText}`);
          }
          
          const data = await response.json();
          
          // Refresh the room list
          await get().fetchRooms();
          return data;
        } catch (error) {
          console.error('Error creating room:', error);
          throw error; // Re-throw to let component handle the error
        }
      },
      
      joinRoom: async (roomId, username, role = 'viewer') => {
        const { setCurrentRoom, setToken, setConnectionStatus, fetchParticipants } = get();
        
        try {
          setConnectionStatus(true, false);
          
          // Get auth token from authStore - this is the key part
          const authToken = useAuthStore.getState().token;
          
          // Build token URL
          const tokenUrl = `${API_ENDPOINTS.TOKEN}?room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}`;
          
          // Pass the auth token in the headers
          const headers: HeadersInit = {};
          if (authToken) {
            headers.Authorization = `Bearer ${authToken}`;
          }
          
          const response = await fetch(tokenUrl, { headers });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get token: ${response.status} ${response.statusText} - ${errorText}`);
          }
          
          const data = await response.json();
          
          if (data.token) {
            setToken(data.token);
            setCurrentRoom(roomId);
            setConnectionStatus(false, true);
            
            // Set the role immediately from the response
            if (data.role) {
              get().setCurrentUserRole(data.role);
            }
            
            // Fetch participants with a delay
            setTimeout(() => fetchParticipants(roomId), 2000);
            
            return data.token;
          } else {
            console.error('No token in response:', data);
            setConnectionStatus(false, false);
            return null;
          }
        } catch (error) {
          console.error('Error joining room:', error);
          setConnectionStatus(false, false);
          return null;
        }
      },
      
      leaveRoom: () => {
        const { setCurrentRoom, setToken, setConnectionStatus, currentRoomId, setParticipants, setCurrentUserRole, setCurrentSharedExtract, clearSharedExtracts } = get();
        
        // Only clear if we actually have a room to leave
        if (currentRoomId) {
          setCurrentRoom(null);
          setToken('');
          setConnectionStatus(false, false);
          setParticipants([]);
          setCurrentUserRole(null);
          setCurrentSharedExtract(null);
          clearSharedExtracts();
        }
      },
      
      deleteRoom: async (roomId) => {
        try {
          const response = await fetch(API_ENDPOINTS.DELETE_ROOM(roomId), {
            method: 'DELETE',
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete room: ${response.status} ${response.statusText} - ${errorText}`);
          }
          
          const data = await response.json();
          
          if (data.success) {
            // Refresh the room list
            await get().fetchRooms();
            
            // If we're in this room, leave it
            if (get().currentRoomId === roomId) {
              get().leaveRoom();
            }
            
            return true;
          }
          
          return false;
        } catch (error) {
          console.error('Error deleting room:', error);
          return false;
        }
      },
      
      updateParticipantRole: async (roomId, participantId, newRole) => {
        try {
          const response = await fetch(API_ENDPOINTS.UPDATE_PARTICIPANT_ROLE(roomId, participantId), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${useAuthStore.getState().token}`
            },
            body: JSON.stringify({ role: newRole }),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update participant role: ${response.status} ${response.statusText} - ${errorText}`);
          }
          
          const data = await response.json();
          
          // Refresh the participants list to reflect the new role
          if (roomId === get().currentRoomId) {
            await get().fetchParticipants(roomId);
          }
          
          return true;
        } catch (error) {
          console.error('Error updating participant role:', error);
          return false;
        }
      },
      
      fetchResearchInterests: async () => {
        try {
          const { setAvailableInterests, setLoadingInterests } = get();
          
          setLoadingInterests(true);
          
          const data = await api.getResearchInterests();
          
          setAvailableInterests(data);
          setLoadingInterests(false);
          return data;
        } catch (error) {
          console.error('Error fetching research interests:', error);
          get().setLoadingInterests(false);
          return [];
        }
      },
      
      fetchSharedExtracts: async (roomId) => {
        const { setLoadingExtracts, setSharedExtracts } = get();
        setLoadingExtracts(true);
        
        try {
          // call backend API to get all shared extracts for the room
          const response = await fetch(API_ENDPOINTS.ROOM_EXTRACTS(roomId));
          
          if (!response.ok) {
            throw new Error(`Failed to fetch shared extracts: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.extracts && Array.isArray(data.extracts)) {
            setSharedExtracts(data.extracts);
          } else {
            setSharedExtracts([]);
          }
          
          // still broadcast the request to make sure local and server state are in sync
          const livekitRoom = (window as any).__lk_room;
          if (livekitRoom?.localParticipant) {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify({
              type: 'request_extract_refresh',
              roomId: roomId,
              timestamp: Date.now()
            }));
            
            livekitRoom.localParticipant.publishData(payload, {
              reliable: true
            });
          }
          
          return data.extracts || [];
        } catch (error) {
          console.error('Error fetching shared extracts:', error);
          setSharedExtracts([]);
          return [];
        } finally {
          setLoadingExtracts(false);
        }
      },
      
      shareExtractInRoom: async (roomId, extractData) => {
        try {
          const { token } = useAuthStore.getState();
          
          if (!token) {
            throw new Error('Not authenticated');
          }
          
          // Call backend API to save the extract
          const response = await fetch(API_ENDPOINTS.SHARE_EXTRACT(roomId), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(extractData),
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to share extract: ${response.status} ${response.statusText} - ${errorText}`);
          }
          
          const data = await response.json();
          
          // Add the extract to our local state
          if (data.extract) {
            get().addSharedExtract(data.extract);
          }
          
          return true;
        } catch (error) {
          console.error('Error sharing extract:', error);
          return false;
        }
      }
    }),
    {
      name: 'livestream-storage',
      // Only persist certain fields, not the token or connection state
      partialize: (state) => ({
        currentRoomId: state.currentRoomId,
        currentUserRole: state.currentUserRole,
      }),
    }
  )
);






