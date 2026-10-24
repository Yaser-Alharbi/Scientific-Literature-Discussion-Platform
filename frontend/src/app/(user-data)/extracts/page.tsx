// frontend/src/app/(user-data)/extracts/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';

interface Extract {
  id: number | string;
  title: string;
  authors: string;
  publication_info: string;
  doi: string | null;
  link: string;
  pdf_link: string | null;
  publication_link: string;
  extract: string;
  page_number: string;
  additional_info: string;
  created_at: string;
}

export default function ExtractsPage() {
  const { token, isAuthenticated } = useAuthStore();
  const [extracts, setExtracts] = useState<Extract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    async function fetchExtracts() {
      if (!isAuthenticated || !token) {
        setError('You must be logged in to view your extracts');
        setIsLoading(false);
        return;
      }
      
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
        
        let extractsData = [];
        if (Array.isArray(data)) {
          extractsData = data;
        } else if (data.extracts && Array.isArray(data.extracts)) {
          extractsData = data.extracts;
        } else if (data.results && Array.isArray(data.results)) {
          extractsData = data.results;
        } else if (data.data && Array.isArray(data.data)) {
          extractsData = data.data;
        } else {
          console.error('Could not find extracts in API response:', data);
          extractsData = [];
        }
        

        setExtracts(extractsData);
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message || 'An error occurred');
        setIsLoading(false);
      }
    }
    
    fetchExtracts();
  }, [token, isAuthenticated]);
  
  const handleDelete = async (id: number | string) => {
    if (!confirm('Are you sure you want to delete this extract?')) {
      return;
    }
    
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/papers/extracts/${id}/`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete extract');
      }
      
      setExtracts(extracts.filter(extract => extract.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete extract');
    }
  };
  
  return (
    <div className="min-h-screen" style={{
      background: 'linear-gradient(140deg, #111827 0%, #131f37 50%, #0f1729 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <div className="container max-w-5xl mx-auto py-10 px-6">
        <h1 className="text-2xl font-bold mb-6 text-gray-100">My Extracts</h1>
        
        
        {isAuthenticated && isLoading && (
          <div className="bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 p-6">
            <p className="text-gray-300">Loading your extracts...</p>
          </div>
        )}
        
        {isAuthenticated && !isLoading && error && (
          <div className="bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 p-6">
            <div className="bg-red-900/50 border border-red-500 p-3 rounded-md mb-4">
              {error}
            </div>
          </div>
        )}
        
        {isAuthenticated && !isLoading && !error && (
          <div className="bg-gray-900/40 backdrop-blur-md rounded-xl shadow-lg border border-gray-800 p-6">
            {extracts.length === 0 ? (
              <p className="text-gray-300">
                You don't have any saved extracts yet. 
                <Link href="/papers" className="text-blue-400 hover:underline ml-1">
                  Search for papers
                </Link> to start saving extracts.
              </p>
            ) : (
              <div className="space-y-6">
                {extracts.map(extract => (
                  <div key={extract.id} className="bg-gray-800/60 rounded-md border border-gray-700 p-4">
                    <div className="flex justify-between items-start">
                      <h2 className="text-xl font-semibold mb-2 text-blue-400 hover:underline">
                        <a href={extract.link} target="_blank" rel="noopener noreferrer">
                          {extract.title}
                        </a>
                      </h2>
                      <button
                        onClick={() => handleDelete(extract.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                        title="Delete extract"
                      >
                        Delete
                      </button>
                    </div>
                    
                    {extract.authors && (
                      <p className="text-sm text-gray-300 mb-2">
                        {extract.authors}
                      </p>
                    )}
                    
                    {extract.publication_info && (
                      <p className="text-sm text-gray-300 mb-2">
                        {extract.publication_info}
                      </p>
                    )}
                    
                    {extract.doi && (
                      <p className="text-sm text-gray-300 mb-2">
                        DOI: <a href={`https://doi.org/${extract.doi}`} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{extract.doi}</a>
                      </p>
                    )}
                    
                    <div className="mt-4 bg-gray-800/80 border border-gray-700 p-3 rounded-md">
                      <h3 className="font-medium mb-2 text-gray-200">Extract:</h3>
                      <p className="text-gray-300">{extract.extract}</p>
                    </div>
                    
                    {extract.page_number && (
                      <p className="mt-2 text-sm text-gray-400">
                        <span className="font-medium text-gray-200">Page:</span> {extract.page_number}
                      </p>
                    )}
                    
                    {extract.additional_info && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-200">Additional Notes:</p>
                        <p className="text-sm text-gray-300">{extract.additional_info}</p>
                      </div>
                    )}
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(extract.pdf_link && extract.pdf_link !== 'null' && extract.pdf_link !== 'undefined' && extract.pdf_link.trim() !== '') ? (
                        <div className="inline-block relative">
                          <a 
                            href={extract.pdf_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 transition-colors"
                          >
                            Open PDF
                          </a>
                        </div>
                      ) : (
                        <div className="inline-block">
                          <span className="bg-gray-700 text-gray-300 px-4 py-1.5 rounded text-sm inline-block cursor-not-allowed">
                            PDF Not Available
                          </span>
                        </div>
                      )}
                      
                      {extract.publication_link && (
                        <a 
                          href={extract.publication_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded hover:bg-blue-700 transition-colors"
                        >
                          View Publication
                        </a>
                      )}
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-3">
                      Saved on {new Date(extract.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 