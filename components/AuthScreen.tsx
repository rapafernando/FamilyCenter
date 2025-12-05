
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Lock, X, ChevronRight, KeyRound, LogOut } from 'lucide-react';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  onCancel: () => void;
  onSetPin: (userId: string, pin: string) => void;
  onAdminLogin?: () => void; // Used for "Exit Family" now
}

type AuthMode = 'select' | 'enter_pin' | 'set_pin' | 'forgot_pin' | 'reset_confirm';

const AuthScreen: React.FC<AuthScreenProps> = ({ users, onLogin, onCancel, onSetPin, onAdminLogin }) => {
  const [mode, setMode] = useState<AuthMode>('select');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCodeInput, setResetCodeInput] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');

  const handleUserSelect = (user: User) => {
    setSelectedUser(user);
    if (user.role === UserRole.KID) {
       onLogin(user);
    } else {
       if (user.pin) {
         setMode('enter_pin');
       } else {
         setMode('set_pin');
       }
    }
    setPinInput('');
    setConfirmPin('');
  };

  const handlePinSubmit = () => {
    if (!selectedUser) return;
    if (pinInput === selectedUser.pin) {
      onLogin(selectedUser);
    } else {
      alert("Incorrect PIN");
      setPinInput('');
    }
  };

  const handleSetPinSubmit = () => {
    if (!selectedUser) return;
    if (pinInput.length !== 4) { alert("PIN must be 4 digits"); return; }
    if (pinInput !== confirmPin) { alert("PINs do not match"); setConfirmPin(''); return; }
    onSetPin(selectedUser.id, pinInput);
    onLogin(selectedUser);
  };

  const handleForgotPin = () => {
    if (!selectedUser) return;
    const targetEmail = selectedUser.email || users.find(u => u.role === UserRole.PARENT && u.email)?.email;
    if (!targetEmail) { alert("No email configured. Cannot reset PIN."); return; }
    setResetEmail(targetEmail);
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedCode(code);
    console.log(`[EMAIL SENT] To: ${targetEmail}, Code: ${code}`);
    alert(`Reset code sent to ${targetEmail}. (Check console: ${code})`);
    setMode('reset_confirm');
  };

  const handleResetSubmit = () => {
     if (resetCodeInput === generatedCode) {
         setMode('set_pin');
         setPinInput('');
         setConfirmPin('');
     } else {
         alert("Invalid code");
     }
  };

  const handlePinInput = (digit: string) => { if (pinInput.length < 4) setPinInput(prev => prev + digit); };
  const handleConfirmPinInput = (digit: string) => { if (confirmPin.length < 4) setConfirmPin(prev => prev + digit); };
  const handleDelete = () => {
      if (mode === 'set_pin' && pinInput.length === 4) {
          if (confirmPin.length > 0) setConfirmPin(prev => prev.slice(0, -1));
          else setPinInput(prev => prev.slice(0, -1));
      } else {
           setPinInput(prev => prev.slice(0, -1));
      }
  };

  const renderKeypad = (target: 'pin' | 'confirm' = 'pin') => (
      <div className="grid grid-cols-3 gap-4 mt-6 max-w-[240px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => target === 'pin' ? handlePinInput(num.toString()) : handleConfirmPinInput(num.toString())} className="w-16 h-16 rounded-full bg-slate-100 text-slate-800 font-bold text-2xl hover:bg-slate-200 active:bg-slate-300 transition-colors">{num}</button>
          ))}
          <div className="col-start-2">
              <button onClick={() => target === 'pin' ? handlePinInput('0') : handleConfirmPinInput('0')} className="w-16 h-16 rounded-full bg-slate-100 text-slate-800 font-bold text-2xl hover:bg-slate-200 active:bg-slate-300 transition-colors">0</button>
          </div>
          <div className="col-start-3">
               <button onClick={handleDelete} className="w-16 h-16 rounded-full text-slate-400 hover:text-slate-600 flex items-center justify-center"><X size={24} /></button>
          </div>
      </div>
  );

  // View: SELECT USER
  if (mode === 'select') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-50/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onCancel} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={32} /></button>
        <h2 className="text-3xl font-bold text-slate-800 mb-10">Who is here?</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {users.map(user => (
            <button key={user.id} onClick={() => handleUserSelect(user)} className="group flex flex-col items-center transition-transform hover:scale-105">
              <div className="relative">
                <img src={user.avatar} alt={user.name} className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-white shadow-md group-hover:border-blue-400 transition-colors"/>
                {user.role === UserRole.PARENT && (<div className="absolute bottom-0 right-0 bg-slate-800 text-white p-2 rounded-full"><Lock size={16} /></div>)}
              </div>
              <span className="mt-4 text-xl font-medium text-slate-700">{user.name}</span>
            </button>
          ))}
        </div>
        {/* Switch Account Link */}
        {onAdminLogin && (
            <div className="absolute bottom-6">
                <button onClick={onAdminLogin} className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-red-400 uppercase tracking-widest transition-colors">
                    <LogOut size={12}/> Exit Family / Switch Account
                </button>
            </div>
        )}
      </div>
    );
  }

  // View: ENTER PIN
  if (mode === 'enter_pin') {
      return (
          <div className="fixed inset-0 z-50 bg-slate-50/95 flex flex-col items-center justify-center p-4">
              <button onClick={() => setMode('select')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-800 flex items-center gap-2"><ChevronRight className="rotate-180"/> Back</button>
              <div className="text-center">
                  <img src={selectedUser?.avatar} className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white shadow-sm"/>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Hello, {selectedUser?.name}</h3>
                  <p className="text-slate-500 mb-8">Enter your PIN to access parent controls</p>
                  <div className="flex gap-4 justify-center mb-6">
                      {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full border border-slate-300 ${pinInput.length > i ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}></div>))}
                  </div>
                  {renderKeypad('pin')}
                  <div className="mt-8 flex flex-col gap-4">
                      <button onClick={handlePinSubmit} disabled={pinInput.length !== 4} className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors">Enter</button>
                      <button onClick={handleForgotPin} className="text-sm text-slate-400 hover:text-blue-500 underline">Forgot PIN?</button>
                  </div>
              </div>
          </div>
      );
  }

  // View: SET PIN
  if (mode === 'set_pin') {
      const isConfirming = pinInput.length === 4;
      return (
          <div className="fixed inset-0 z-50 bg-slate-50/95 flex flex-col items-center justify-center p-4">
               <h3 className="text-2xl font-bold text-slate-800 mb-2">Set Your PIN</h3>
               <p className="text-slate-500 mb-8 max-w-xs text-center">Secure your parent account with a 4-digit code.</p>
               <div className="flex flex-col gap-8 w-full max-w-sm items-center">
                   <div className={`transition-opacity ${isConfirming ? 'opacity-50' : 'opacity-100'}`}>
                       <label className="block text-xs font-bold uppercase text-slate-400 mb-2 text-center">New PIN</label>
                       <div className="flex gap-4 justify-center">
                          {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full border border-slate-300 ${pinInput.length > i ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}></div>))}
                       </div>
                   </div>
                   {isConfirming && (
                       <div className="animate-in fade-in slide-in-from-bottom-4">
                           <label className="block text-xs font-bold uppercase text-slate-400 mb-2 text-center">Confirm PIN</label>
                           <div className="flex gap-4 justify-center">
                              {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full border border-slate-300 ${confirmPin.length > i ? 'bg-green-600 border-green-600' : 'bg-white'}`}></div>))}
                           </div>
                       </div>
                   )}
                   {renderKeypad(isConfirming ? 'confirm' : 'pin')}
                   <div className="mt-4 flex flex-col items-center gap-2">
                       {isConfirming && (<p className="text-sm text-slate-500">Re-enter PIN to confirm</p>)}
                       <button onClick={handleSetPinSubmit} disabled={pinInput.length !== 4 || confirmPin.length !== 4} className={`bg-blue-600 text-white px-8 py-3 rounded-full font-bold text-lg transition-all ${pinInput.length === 4 && confirmPin.length === 4 ? 'opacity-100 scale-105' : 'opacity-0 scale-95 pointer-events-none'}`}>Save PIN</button>
                   </div>
               </div>
          </div>
      );
  }

  // View: RESET CONFIRM
  if (mode === 'reset_confirm') {
      return (
          <div className="fixed inset-0 z-50 bg-slate-50/95 flex flex-col items-center justify-center p-4">
              <KeyRound size={48} className="text-slate-300 mb-4"/>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Enter Reset Code</h3>
              <p className="text-slate-500 mb-6 text-center max-w-xs">We sent a 4-digit code to <strong>{resetEmail}</strong></p>
              <input type="text" maxLength={4} value={resetCodeInput} onChange={(e) => setResetCodeInput(e.target.value)} className="text-4xl font-mono tracking-[1em] text-center bg-transparent border-b-2 border-slate-300 focus:border-blue-500 outline-none w-64 mb-8"/>
              <button onClick={handleResetSubmit} className="bg-blue-600 text-white px-8 py-3 rounded-full font-bold">Verify Code</button>
              <button onClick={() => setMode('enter_pin')} className="mt-4 text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
      );
  }

  return null;
};

export default AuthScreen;
