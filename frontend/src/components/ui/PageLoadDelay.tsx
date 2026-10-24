// frontend/src/components/ui/PageLoadDelay.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter, usePathname } from 'next/navigation';

// routes that don't need authentication
const PUBLIC_PATHS = ['/Login', '/Signup', '/ForgotPassword', '/ResetPassword'];

export default function PageLoadDelay({ children }: { children: React.ReactNode }) {
  const [showContent, setShowContent] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  
  useEffect(() => {
    // handle auth redirects for known/valid routes
    const isPublicPath = PUBLIC_PATHS.some(path => 
      pathname === path || pathname?.startsWith(`${path}/`)
    );
    const isPasswordReset = pathname?.includes('ResetPassword');
    
    let isMounted = true;

    // window.fetch to check if the route exists before redirecting
    if (!isAuthenticated && !isPublicPath && !isPasswordReset && pathname !== '/') {
      // check if the current URL returns a 404
      fetch(window.location.pathname) // fetch the current URL
        .then(response => {
          //redirect if component is still mounted
          if (!isMounted) return;
          
          // redirect if the page exists but requires authentication, otherwise Next.js shows the not-found page
          if (response.ok) {
            setTimeout(() => {
              router.push('/');
            }, 0);
          }
        })
        .catch(() => {
          // network error, this will display the not-found page automatically since the fetch will return a 404
        });
    } else {
      // show content after a brief delay just to avoid flashes
      const timer = setTimeout(() => {
        if (isMounted) {
          setShowContent(true);
        }
      }, 300);
      
      return () => {
        clearTimeout(timer);
        isMounted = false;
      };
    }
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, pathname, router]);
  
  // show loading first
  if (!showContent) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-80 z-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-700">Loading...</p>
        </div>
      </div>
    );
  }
  
  return children;
}