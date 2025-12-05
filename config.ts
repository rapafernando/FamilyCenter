
// Replace this with your actual Google Cloud Console Client ID
// It usually looks like "123456789-abcde...apps.googleusercontent.com"
export const GOOGLE_CLIENT_ID = "576992919448-164tl06bhj97e8o0l1f6jsn6p1hnsrc9.apps.googleusercontent.com";

// Scopes required for the application
// 'profile': To get the user's name and avatar
// 'calendar': To read AND write events (Removed .readonly)
// 'photoslibrary.readonly': To read albums and photos
// 'openid': Standard authentication
export const GOOGLE_SCOPES = "openid profile email https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/photoslibrary.readonly";
