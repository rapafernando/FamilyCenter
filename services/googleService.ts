
import { CalendarEvent, Photo } from '../types';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../config';

// Declare types for the Google Identity Services client
declare global {
  interface Window {
    google: any;
  }
}

let tokenClient: any;

/**
 * Initialize the Google Identity Services Token Client.
 * This should be called when the app starts or the auth component mounts.
 */
export const initGoogleClient = (callback: (response: any) => void) => {
  if (typeof window !== 'undefined' && window.google) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          callback(tokenResponse);
        }
      },
    });
  }
};

/**
 * Triggers the Google Sign-In popup flow.
 * @param options - Optional configuration, e.g., { prompt: 'consent' } to force re-authorization
 */
export const signInWithGoogle = (options?: { prompt?: string }) => {
  if (tokenClient) {
    if (options?.prompt) {
        // Request with specific prompt (e.g. to force account selection or consent)
        tokenClient.requestAccessToken({ prompt: options.prompt });
    } else {
        tokenClient.requestAccessToken();
    }
  } else {
    console.error("Google Token Client not initialized");
    alert("Google Client not ready. Please check your internet connection or Client ID.");
  }
};

/**
 * Fetches the user's profile information using the access token.
 */
export const fetchUserProfile = async (accessToken: string) => {
  if (!accessToken) throw new Error("No access token");
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch user profile');
  return response.json();
};

/**
 * Fetch list of available calendars for the user
 */
export const fetchCalendarList = async (accessToken: string) => {
  if (!accessToken) return [];
  try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
          headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Failed to fetch calendars');
      }

      const data = await response.json();
      return data.items || [];
  } catch (e) {
      console.error("Error fetching calendar list", e);
      throw e;
  }
};

/**
 * Fetch list of Google Photo Albums
 */
export const fetchAlbums = async (accessToken: string) => {
    if (!accessToken) return [];
    try {
        const response = await fetch('https://photoslibrary.googleapis.com/v1/albums?pageSize=50', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Failed to fetch albums');
        }

        const data = await response.json();
        // The API returns 'albums' for app-created albums and readable user albums
        // If empty, it might be that the user has no albums or permissions issues.
        return data.albums || [];
    } catch (e) {
        console.error("Error fetching albums", e);
        throw e;
    }
};

/**
 * Fetch photos from a specific album
 */
export const fetchPhotosFromAlbum = async (accessToken: string, albumId: string): Promise<Photo[]> => {
    if (!accessToken || !albumId) return [];
    try {
        const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
            method: 'POST',
            headers: { 
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                albumId: albumId,
                pageSize: 50
            })
        });
        
        if (!response.ok) {
             const err = await response.json();
             console.error("Photo Fetch Error", err);
             // Don't throw here to avoid crashing the whole dashboard view, just return empty
             return [];
        }

        const data = await response.json();
        
        if (!data.mediaItems) return [];

        return data.mediaItems
            .filter((item: any) => item.mimeType?.startsWith('image/'))
            .map((item: any) => ({
                id: item.id,
                url: `${item.baseUrl}=w2048-h1024`, // Request specific size
                date: item.mediaMetadata?.creationTime || new Date().toISOString(),
                location: '' // API doesn't always return location easily without extra scopes/processing
            }));
    } catch (e) {
        console.error("Error fetching photos", e);
        return [];
    }
};

/**
 * Fetches upcoming events from a specific calendar
 */
export const fetchGoogleCalendarEvents = async (
    accessToken: string, 
    calendarId: string = 'primary',
    color: string = 'bg-blue-100 text-blue-800 border-blue-200',
    prefix: string = ''
): Promise<CalendarEvent[]> => {
  if (!accessToken) return [];

  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setDate(now.getDate() + 30);

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${now.toISOString()}&timeMax=${nextMonth.toISOString()}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    
    // We don't throw here to prevent one broken calendar from breaking all events
    if (!response.ok) return [];

    const data = await response.json();
    
    if (!data.items) return [];

    return data.items.map((item: any) => ({
      id: item.id,
      title: prefix ? `${prefix} ${item.summary}` : (item.summary || 'Busy'),
      start: item.start.dateTime || item.start.date, // Handle all-day events
      end: item.end.dateTime || item.end.date,
      type: 'family', 
      color: color 
    }));

  } catch (error) {
    console.error("Error fetching calendar:", error);
    return [];
  }
};
