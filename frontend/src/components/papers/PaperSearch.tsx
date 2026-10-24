// frontend/src/components/papers/PaperSearch.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { usePaperStore } from '@/store/paperStore';
import ExtractModal from './ExtractModal';

export default function PaperSearch() {
  const { 
    query, 
    results, 
    isLoading, 
    error, 
    cooldownActive,
    setQuery, 
    search,
    openExtractModal
  } = usePaperStore();
  
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;
  
  // for dropdown toggle
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const dropdownRefs = useRef<Array<HTMLDivElement | null>>([]);
  
  // handle clicks outside dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (openDropdownIndex !== null && 
          dropdownRefs.current[openDropdownIndex] && 
          !dropdownRefs.current[openDropdownIndex]?.contains(event.target as Node)) {
        setOpenDropdownIndex(null);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdownIndex]);
  
  
  const [hasSearched, setHasSearched] = useState(false);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    search();
    setCurrentPage(1); 
    setHasSearched(true); 
  };
  
  // calculate pagination
  const indexOfLastResult = currentPage * resultsPerPage;
  const indexOfFirstResult = indexOfLastResult - resultsPerPage;
  const currentResults = results.slice(indexOfFirstResult, indexOfLastResult);
  const totalPages = Math.ceil(results.length / resultsPerPage);
  
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);
  
  const toggleDropdown = (index: number) => {
    setOpenDropdownIndex(openDropdownIndex === index ? null : index);
  };
  
  return (
    <div className="bg-gray-900/40 backdrop-blur-md rounded-xl p-6 shadow-lg border border-gray-800 overflow-hidden relative">
      {/* Glow effects */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl"></div>
      <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-600/5 rounded-full blur-3xl"></div>

      <div className="mb-6">
        <form onSubmit={handleSearch} className="flex">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Google Scholar..."
            className="flex-grow p-3 bg-gray-800/80 border border-gray-700 rounded-l-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={isLoading || cooldownActive}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-r-lg hover:from-blue-500 hover:to-indigo-500 disabled:opacity-70 transition-all duration-200"
          >
            {isLoading ? 'Searching...' : cooldownActive ? 'Wait...' : 'Search'}
          </button>
        </form>
      </div>
      
      {error && (
        <div className="bg-red-900/30 border border-red-800/50 text-red-200 p-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}
      
      <div className="space-y-4">
        {currentResults.map((result, index) => {
          // check if any pdf resources are available
          const resources = result.resources || [];
          const hasPdfResources = resources.length > 0;
          const pdfResource = hasPdfResources ? resources[0] : null;
          const hasMultipleResources = resources.length > 1;
          
          // calculate unique index for this dropdown in the page
          const dropdownIndex = (currentPage - 1) * resultsPerPage + index;
          
          return (
            <div key={index} className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-5 relative border border-gray-700 hover:border-gray-600 transition-colors">
              
              {/* Save Extract Button in top right corner */}
              <button
                onClick={() => openExtractModal(result)}
                className="absolute top-2 right-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs px-3 py-1 rounded-lg hover:from-blue-500 hover:to-indigo-500 transition-all duration-200"
                title="Save Extract"
              >
                Save Extract
              </button>
              
              <h2 className="text-xl font-semibold mb-2 pr-28">
                <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  {result.title}
                </a>
              </h2>
              
              {result.publication_info?.summary && (
                <p className="mb-1 text-gray-300">
                  {result.publication_info.summary}
                </p>
              )}
              
              {/* doi information */}
              {result.doi ? (
                <p className="text-sm text-gray-300 mb-2">
                  DOI: <a href={`https://doi.org/${result.doi}`} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{result.doi}</a>
                </p>
              ) : (
                <p className="text-sm text-gray-300 mb-2">DOI: Not available</p>
              )}
              
              {/* combined pdf access area for primary pdf and additional resources */}
              <div className="mb-2 mt-3">
                {/* first priority: unpaywall pdf */}
                {result.unpaywall?.pdf_url ? (
                  <div className="inline-block relative">
                    <div>
                      <a 
                        href={result.unpaywall.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-1.5 rounded-l-lg text-sm hover:from-green-500 hover:to-green-600 inline-block transition-all duration-200"
                      >
                        Open PDF
                      </a>
                      
                      {/* if there are additional resources, add a dropdown-style menu */}
                      {hasPdfResources && (
                        <div 
                          ref={el => {
                            dropdownRefs.current[dropdownIndex] = el;
                          }}
                          className="relative inline-block"
                        >
                          <button 
                            className="bg-gradient-to-r from-green-700 to-green-800 text-white px-2 py-1.5 border-l border-green-500 rounded-r-lg text-sm hover:from-green-600 hover:to-green-700 transition-all duration-200"
                            onClick={() => toggleDropdown(dropdownIndex)}
                          >
                            ▼
                          </button>
                          
                          {openDropdownIndex === dropdownIndex && (
                            <div className="absolute left-0 mt-1 z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
                              {resources.map((resource, i) => (
                                <a 
                                  key={i}
                                  href={resource.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block px-4 py-2 text-sm hover:bg-gray-700 whitespace-nowrap transition-colors"
                                >
                                  Google Scholar: {resource.title} [{resource.file_format}]
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Source: Unpaywall</div>
                  </div>
                ) : hasPdfResources && pdfResource ? (
                  // second priority: resource pdf if no unpaywall pdf
                  <div className="inline-block relative">
                    <div>
                      <a 
                        href={pdfResource.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-1.5 rounded-l-lg text-sm hover:from-green-500 hover:to-green-600 inline-block transition-all duration-200"
                      >
                        Open PDF
                      </a>
                      
                      {/* if there are multiple resources, add a dropdown */}
                      {hasMultipleResources && (
                        <div 
                          ref={el => {
                            dropdownRefs.current[dropdownIndex] = el;
                          }}
                          className="relative inline-block"
                        >
                          <button 
                            className="bg-gradient-to-r from-green-700 to-green-800 text-white px-2 py-1.5 border-l border-green-500 rounded-r-lg text-sm hover:from-green-600 hover:to-green-700 transition-all duration-200"
                            onClick={() => toggleDropdown(dropdownIndex)}
                          >
                            ▼
                          </button>
                          
                          {openDropdownIndex === dropdownIndex && (
                            <div className="absolute left-0 mt-1 z-10 bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
                              {resources.slice(1).map((resource, i) => (
                                <a 
                                  key={i}
                                  href={resource.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block px-4 py-2 text-sm hover:bg-gray-700 whitespace-nowrap transition-colors"
                                >
                                  Google Scholar: {resource.title} [{resource.file_format}]
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Source: Google Scholar</div>
                  </div>
                ) : (
                  // no pdfs available
                  <div className="inline-block">
                    <span className="bg-gray-700 text-gray-300 px-4 py-1.5 rounded-lg text-sm inline-block cursor-not-allowed border border-gray-600">
                      PDF Not Available
                    </span>
                  </div>
                )}
              </div>
              
              {result.snippet && (
                <p className="mb-3 text-gray-300">{result.snippet}</p>
              )}
              
              <div className="flex flex-wrap gap-2 mt-3">
                {/* citation link */}
                {result.inline_links?.cited_by && (
                  <a 
                    href={result.inline_links.cited_by.link}
                    target="_blank"
                    rel="noopener noreferrer" 
                    className="bg-blue-900/60 border border-blue-800/70 text-white px-3 py-1 rounded-full text-sm hover:bg-blue-800/60 transition-colors"
                  >
                    Cited by {result.inline_links.cited_by.total}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        
        {results.length === 0 && !isLoading && query && !error && hasSearched && (
          <p className="text-gray-400 text-center p-4">No results found.</p>
        )}
      </div>
      
      {/* pagination */}
      {results.length > 0 && (
        <div className="flex justify-center mt-6">
          <nav className="flex items-center">
            <button
              onClick={() => paginate(currentPage > 1 ? currentPage - 1 : 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-800/70 border border-gray-700 rounded-l-lg hover:bg-gray-700/70 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            
            <div className="flex">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => paginate(i + 1)}
                  className={`px-3 py-1 border-t border-b border-gray-700 ${
                    currentPage === i + 1 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500' 
                      : 'bg-gray-800/70 hover:bg-gray-700/70 text-gray-200'
                  } transition-colors`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => paginate(currentPage < totalPages ? currentPage + 1 : totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-800/70 border border-gray-700 rounded-r-lg hover:bg-gray-700/70 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </nav>
        </div>
      )}
      
      <ExtractModal />
    </div>
  );
}