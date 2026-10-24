'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function RedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    // Get room ID from URL params, safely handling null
    const roomId = searchParams ? searchParams.get('id') : null;
    
    if (roomId) {
      // Redirect to new URL format
      router.push(`/room/${roomId}`);
    } else {
      // If no room ID, redirect to rooms list
      router.push('/rooms');
    }
  }, [router, searchParams]);
  
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-lg">Redirecting...</div>
    </div>
  );
}