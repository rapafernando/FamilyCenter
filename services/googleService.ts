import { CalendarEvent } from '../types';
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../config';

// Declare types for the Google Identity Services client
declare global {
  interface Window {
    google: any;
  }
}

let tokenClient: any;
let accessToken: string | null = null;

/**
 * Initialize the Google Identity Services Token Client.
 * This should be called when the app starts or the auth component mounts.
 */
export const initGoogleClient = (callback: (response: any) => void) => {
  if (window.google) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          accessToken = tokenResponse.access_token;
          callback(tokenResponse);
        }
      },
    });
  }
};

/**
 * Triggers the Google Sign-In popup flow.
 */
export const signInWithGoogle = () => {
  if (tokenClient) {
    // Request access token. 
    // 'prompt': '' ensures it doesn't force re-consent every time if valid, 
    // but for a kiosk, you might handle token refresh differently.
    tokenClient.requestAccessToken();
  } else {
    console.error("Google Token Client not initialized");
    alert("Google Client not ready. Please check your internet connection or Client ID.");
  }
};

/**
 * Fetches the user's profile information using the access token.
 */
export const fetchUserProfile = async () => {
  if (!accessToken) throw new Error("No access token");

  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.json();
};

/**
 * Fetches upcoming events from the user's primary calendar.
 */
export const fetchGoogleCalendarEvents = async (): Promise<CalendarEvent[]> => {
  if (!accessToken) return [];

  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setDate(now.getDate() + 30);

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${nextMonth.toISOString()}&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await response.json();
    
    if (!data.items) return [];

    return data.items.map((item: any) => ({
      id: item.id,
      title: item.summary || 'Busy',
      start: item.start.dateTime || item.start.date, // Handle all-day events
      end: item.end.dateTime || item.end.date,
      type: 'family', // Default to family, logic could be enhanced to parse colors
      color: 'bg-blue-100 text-blue-800 border-blue-200' // Default sync color
    }));

  } catch (error) {
    console.error("Error fetching calendar:", error);
    return [];
  }
};
