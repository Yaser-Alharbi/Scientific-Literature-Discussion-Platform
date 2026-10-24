// frontend/src/store/paperStore.ts
import { create } from 'zustand';
import { useAuthStore } from '@/store/authStore';

interface PaperResult {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  doi?: string;
  publication_info?: {
    summary: string;
    authors?: string[];
    journal?: string;
    year?: number;
  };
  resources?: {
    title: string;
    file_format: string;
    link: string;
  }[];
  inline_links?: {
    cited_by?: {
      total: number;
      link: string;
    };
    versions?: {
      total: number;
      link: string;
    };
    related_pages_link?: string;
  };
  unpaywall?: {
    is_oa: boolean;
    oa_status?: string;
    oa_url?: string;
    pdf_url?: string;
    journal?: string;
    year?: number;
    publisher?: string;
  };
}

interface ExtractFormData {
  title: string;
  authors: string;
  publication_info: string;
  doi?: string;
  link: string;
  pdf_link?: string;
  publication_link?: string;
  extract: string;
  page_number: string;
  additional_info: string;
}

interface Extract {
  id: string;
  title: string;
  authors: string;
  publication_info: string;
  doi?: string;
  link: string;
  pdf_link?: string;
  publication_link?: string;
  extract: string;
  page_number: string;
  additional_info: string;
  created_at: string;
}

interface PaperState {
  query: string;
  results: PaperResult[];
  isLoading: boolean;
  error: string | null;
  cooldownActive: boolean;
  extractModalOpen: boolean;
  currentPaper: PaperResult | null;
  extractFormData: ExtractFormData;
  saveExtractLoading: boolean;
  saveExtractError: string | null;
  saveExtractSuccess: boolean;
  userExtracts: Extract[];
  loadingExtracts: boolean;
  sharedExtract: Extract | null;
  
  // Actions
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  clearResults: () => void;
  openExtractModal: (paper: PaperResult) => void;
  closeExtractModal: () => void;
  updateExtractFormData: (data: Partial<ExtractFormData>) => void;
  saveExtract: () => Promise<void>;
  fetchUserExtracts: () => Promise<Extract[]>;
  shareExtract: (extractId: string, roomId: string) => Promise<boolean>;
  setSharedExtract: (extract: Extract | null) => void;
}

export const usePaperStore = create<PaperState>()((set, get) => ({
  query: '',
  results: [],
  isLoading: false,
  error: null,
  cooldownActive: false,
  extractModalOpen: false,
  currentPaper: null,
  extractFormData: {
    title: '',
    authors: '',
    publication_info: '',
    doi: '',
    link: '',
    pdf_link: '',
    publication_link: '',
    extract: '',
    page_number: '',
    additional_info: ''
  },
  saveExtractLoading: false,
  saveExtractError: null,
  saveExtractSuccess: false,
  userExtracts: [],
  loadingExtracts: false,
  sharedExtract: null,
  
  setQuery: (query) => set({ query }),
  
  search: async () => {
    const { query, cooldownActive } = get();
    const { token } = useAuthStore.getState();
    
    if (cooldownActive) {
      return;
    }
    
    if (!query.trim()) {
      set({ error: 'Please enter a search query' });
      return;
    }
    
    if (!token) {
      set({ error: 'You must be logged in to search' });
      return;
    }
    
    set({ isLoading: true, error: null });
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/search?query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 429) {
        set({ 
          isLoading: false, 
          cooldownActive: true,
          error: 'Please wait a moment before searching again.'
        });
        
        // reset cooldown after 5 seconds
        setTimeout(() => {
          set({ cooldownActive: false });
        }, 5000);
        
        return;
      }
      
      if (response.status === 401) {
        // try to refresh the token
        try {
          await useAuthStore.getState().refreshToken();
          const newToken = useAuthStore.getState().token;
          
          if (newToken) {
            // retry with the new token
            const retryResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/search?query=${encodeURIComponent(query)}`, {
              headers: {
                'Authorization': `Bearer ${newToken}`
              }
            });
            
            if (!retryResponse.ok) {
              throw new Error('Authentication failed. Please log in again.');
            }
            
            const data = await retryResponse.json();
            set({ 
              results: data.organic_results || [], 
              isLoading: false 
            });
            return;
          }
        } catch (refreshError) {
          set({ 
            isLoading: false, 
            error: 'Your session has expired. Please log in again.',
            results: []
          });
          return;
        }
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search');
      }
      
      const data = await response.json();
      set({ 
        results: data.organic_results || [], 
        isLoading: false 
      });
      
    } catch (err: any) {
      set({ 
        isLoading: false, 
        error: err.message || 'An error occurred',
        results: []
      });
    }
  },
  
  clearResults: () => set({ results: [], error: null }),
  
  openExtractModal: (paper) => {
    // Get PDF link
    let pdfLink = '';
    let publicationLink = paper.link || '';
    
    // Check for pdf in unpaywall first
    if (paper.unpaywall?.pdf_url) {
      pdfLink = paper.unpaywall.pdf_url;
    } 
    // Otherwise check for resources
    else if (paper.resources && paper.resources.length > 0) {
      pdfLink = paper.resources[0].link;
    }
    
    // Prepare authors string
    let authorsStr = '';
    if (paper.publication_info?.authors && paper.publication_info.authors.length > 0) {
      authorsStr = paper.publication_info.authors.join(', ');
    }
    
    set({ 
      extractModalOpen: true,
      currentPaper: paper,
      extractFormData: {
        title: paper.title || '',
        authors: authorsStr,
        publication_info: paper.publication_info?.summary || '',
        doi: paper.doi || '',
        link: paper.link || '',
        pdf_link: pdfLink,
        publication_link: publicationLink,
        extract: '',
        page_number: '',
        additional_info: ''
      },
      saveExtractSuccess: false,
      saveExtractError: null
    });
  },
  
  closeExtractModal: () => set({ 
    extractModalOpen: false, 
    currentPaper: null,
    saveExtractSuccess: false,
    saveExtractError: null
  }),
  
  updateExtractFormData: (data) => set({ 
    extractFormData: { ...get().extractFormData, ...data } 
  }),
  
  saveExtract: async () => {
    const { extractFormData } = get();
    const { token } = useAuthStore.getState();
    
    if (!token) {
      set({ saveExtractError: 'You must be logged in to save extracts' });
      return;
    }
    
    if (!extractFormData.extract.trim()) {
      set({ saveExtractError: 'Extract content is required' });
      return;
    }
    
    set({ saveExtractLoading: true, saveExtractError: null, saveExtractSuccess: false });
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/extracts/save/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(extractFormData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save extract');
      }
      
      set({ 
        saveExtractLoading: false,
        saveExtractSuccess: true,
        saveExtractError: null
      });
      
      // Close modal after a delay
      setTimeout(() => {
        get().closeExtractModal();
      }, 2000);
      
    } catch (err: any) {
      set({ 
        saveExtractLoading: false,
        saveExtractSuccess: false,
        saveExtractError: err.message || 'Failed to save extract'
      });
    }
  },
  
  fetchUserExtracts: async () => {
    const { token } = useAuthStore.getState();
    
    if (!token) {
      return [];
    }
    
    set({ loadingExtracts: true });
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/extracts/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch extracts');
      }
      
      const data = await response.json();
      
      
      // api might return extracts directly as an array rather than inside an 'extracts' property
      let extractsData = [];
      
      if (Array.isArray(data)) {
        // if the response is already an array, use it directly
        extractsData = data;
      } else if (data.extracts && Array.isArray(data.extracts)) {
        // if the response has an 'extracts' property
        extractsData = data.extracts;
      } else if (data.results && Array.isArray(data.results)) {
        // some APIs use 'results' for pagination
        extractsData = data.results;
      } else if (data.data && Array.isArray(data.data)) {
        // some APIs nest data in a 'data' property
        extractsData = data.data;
      } else {
        console.error('Could not find extracts in API response:', data);
        extractsData = [];
      }
      
      
      set({ userExtracts: extractsData, loadingExtracts: false });
      return extractsData;
    } catch (err) {
      console.error('Error fetching extracts:', err);
      set({ loadingExtracts: false });
      return [];
    }
  },
  
  shareExtract: async (extractId, roomId) => {
    const { token } = useAuthStore.getState();
    
    if (!token) {
      return false;
    }
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/extracts/${extractId}/share/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ room_id: roomId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to share extract');
      }
      
      const data = await response.json();
      return true;
    } catch (err) {
      console.error('Error sharing extract:', err);
      return false;
    }
  },
  
  setSharedExtract: (extract) => set({ sharedExtract: extract })
}));