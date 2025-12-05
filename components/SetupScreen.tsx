
import React, { useState } from 'react';
import { Sparkles, Loader2, ShieldCheck, Users, Calendar } from 'lucide-react';
import { initGoogleClient, signInWithGoogle, fetchUserProfile } from '../services/googleService';

interface SetupScreenProps {
  onSetupComplete: (profile: any, token: string) => void;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = () => {
    setIsLoading(true);
    setError(null);

    initGoogleClient(async (response) => {
      if (response && response.access_token) {
        try {
          const profile = await fetchUserProfile(response.access_token);
          onSetupComplete(profile, response.access_token);
        } catch (err) {
          console.error(err);
          setError("Failed to fetch user profile. Please try again.");
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    signInWithGoogle();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 md:p-12 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-lg shadow-blue-200 rotate-3 hover:rotate-6 transition-transform">
           <Sparkles className="text-white w-10 h-10" />
        </div>

        <h1 className="text-3xl md:text-4xl font-black text-slate-800 mb-4 tracking-tight">FamilySync</h1>
        <p className="text-slate-500 mb-10 text-lg leading-relaxed">
          Your all-in-one family dashboard. Organize chores, sync calendars, and celebrate rewards together.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-10 text-slate-400">
            <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-slate-50 rounded-2xl"><Users size={20} className="text-blue-500"/></div>
                <span className="text-xs font-bold uppercase tracking-wide">Family</span>
            </div>
            <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-slate-50 rounded-2xl"><Calendar size={20} className="text-purple-500"/></div>
                <span className="text-xs font-bold uppercase tracking-wide">Plan</span>
            </div>
            <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-slate-50 rounded-2xl"><ShieldCheck size={20} className="text-green-500"/></div>
                <span className="text-xs font-bold uppercase tracking-wide">Safe</span>
            </div>
        </div>

        <button 
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
        >
          {isLoading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
               <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" className="w-5 h-5" alt="G"/>
               <span>Connect with Google</span>
            </>
          )}
        </button>

        {error && (
            <p className="mt-4 text-red-500 text-sm font-medium bg-red-50 p-3 rounded-xl">{error}</p>
        )}

        <p className="mt-8 text-xs text-slate-400">
          By continuing, you are creating a new family admin account on this device.
        </p>
      </div>
    </div>
  );
};

export default SetupScreen;
