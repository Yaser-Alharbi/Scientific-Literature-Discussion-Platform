import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

// Do not cache endpoint result
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const username = req.nextUrl.searchParams.get('username');
  const role = req.nextUrl.searchParams.get('role') || 'viewer';
  
  if (!room) {
    return NextResponse.json({ error: 'Missing "room" query parameter' }, { status: 400 });
  } else if (!username) {
    return NextResponse.json({ error: 'Missing "username" query parameter' }, { status: 400 });
  }


  try {
    // Build the backend URL
    const backendUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/livestream/rooms/${room}/token?role=${role}&username=${encodeURIComponent(username)}`;
    
    // Forward the auth header if it exists
    const headers: Record<string, string> = {};
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    } else {
      console.warn("[Token API] WARNING: No auth header found - will not be authenticated!");
    }
    
    const response = await fetch(backendUrl, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Token API] Backend error: ${errorText}`);
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error generating token:', error);
    return NextResponse.json({ 
      error: 'Failed to get token',
      details: error.message 
    }, { status: 500 });
  }
}