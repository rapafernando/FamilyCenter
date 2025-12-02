import React, { useEffect } from 'react';
import { User, UserRole } from '../types';
import { Lock, User as UserIcon, X, Loader2 } from 'lucide-react';
import { initGoogleClient, signInWithGoogle, fetchUserProfile } from '../services/googleService';
import { GOOGLE_CLIENT_ID } from '../config';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  onGoogleSuccess: (googleUser: any) => void;
  onCancel: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ users, onLogin, onGoogleSuccess, onCancel }) => {
  const [isGoogleAuthenticated, setIsGoogleAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    // Initialize Google Client when component mounts
    initGoogleClient(async (tokenResponse) => {
      setIsLoading(true);
      try {
        const profile = await fetchUserProfile();
        setIsGoogleAuthenticated(true);
        onGoogleSuccess(profile);
      } catch (err) {
        setError("Failed to fetch user profile.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    });
  }, [onGoogleSuccess]);

  const handleGoogleLogin = () => {
    if (GOOGLE_CLIENT_ID.includes("YOUR_CLIENT_ID")) {
      setError("Please configure your Client ID in config.ts first!");
      return;
    }
    signInWithGoogle();
  };

  if (!isGoogleAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
        <button 
          onClick={onCancel}
          className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors"
        >
          <X size={32} />
        </button>
        
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome to FamilySync</h1>
          <p className="text-slate-500 mb-8">Sign in to access your family dashboard and sync calendar.</p>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-3 px-4 rounded-xl transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="animate-spin text-slate-400" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sync & Sign In with Google
              </>
            )}
          </button>
          
          <p className="mt-6 text-xs text-slate-400">
             Note: This requires a Google Cloud Project with the Calendar API enabled.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
       <button 
          onClick={onCancel}
          className="absolute top-8 right-8 text-slate-400 hover:text-slate-800 transition-colors"
        >
          <X size={32} />
        </button>

      <div className="flex items-center gap-2 mb-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-medium">
         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
         Google Account Connected
      </div>
      <h2 className="text-3xl font-bold text-slate-800 mb-10">Who is here?</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {users.map(user => (
          <button 
            key={user.id}
            onClick={() => onLogin(user)}
            className="group flex flex-col items-center transition-transform hover:scale-105"
          >
            <div className="relative">
              <img 
                src={user.avatar} 
                alt={user.name} 
                className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-white shadow-md group-hover:border-blue-400 transition-colors"
              />
              {user.role === UserRole.PARENT && (
                <div className="absolute bottom-0 right-0 bg-slate-800 text-white p-1.5 rounded-full">
                  <UserIcon size={16} />
                </div>
              )}
            </div>
            <span className="mt-4 text-xl font-medium text-slate-700">{user.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AuthScreen;