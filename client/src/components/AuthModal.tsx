import React, { useState } from 'react';
import { WebGPUBackdrop } from './duel3d/WebGPUBackdrop';

interface AuthModalProps {
  onLoginSuccess: (user: { email: string; nickname: string; isGuest?: boolean }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState(() => localStorage.getItem('ygo_last_email') || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(() => localStorage.getItem('ygo_last_nickname') || '');
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Por favor, preencha email e senha.');
      return;
    }

    const resolvedNickname = nickname.trim() || email.split('@')[0] || 'Duelista';
    localStorage.setItem('ygo_last_email', email.trim());
    localStorage.setItem('ygo_last_nickname', resolvedNickname);

    onLoginSuccess({
      email: email.trim(),
      nickname: resolvedNickname,
      isGuest: false,
    });
  };

  const handleGuestPlay = () => {
    onLoginSuccess({
      email: 'guest@reino-dos-duelistas.com',
      nickname: 'Yugi Muto',
      isGuest: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
      <WebGPUBackdrop variant="auth" showBadge={true} className="z-0" />
      <div className="w-full max-w-md bg-[#141210]/95 border-2 border-amber-800/80 rounded-2xl p-7 shadow-[0_8px_35px_rgba(0,0,0,0.92)] flex flex-col items-center relative z-10 overflow-hidden backdrop-blur-md">
        
        {/* Glow atmosférico suave Dark Stone & Aged Gold */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

        {/* Emblema do Olho do Milênio */}
        <div className="text-4xl text-amber-400 drop-shadow-[0_2px_12px_rgba(245,158,11,0.5)] mb-1">
          𓂀
        </div>
        <h1 className="text-2xl font-black font-serif tracking-widest text-amber-300 text-center">
          REINO DOS DUELISTAS
        </h1>
        <p className="text-[10px] text-amber-200/70 font-mono tracking-widest uppercase mt-1 mb-6">
          {isSignUp ? '[CRIAR CONTA DE DUELISTA]' : '[ACESSO À ARENA SAGRADA]'}
        </p>

        {errorMsg && (
          <div className="w-full mb-4 px-3 py-2 bg-red-950/90 border border-red-700/80 rounded text-red-200 text-xs text-center font-mono font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-3.5">
          <div>
            <label className="block text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              Nickname de Duelista
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ex: Yugi Muto, Seto Kaiba, SeuNick"
              className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu-email@dominio.com"
              required
              className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 mt-2 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-lg border border-amber-300 transition-all cursor-pointer active:scale-95 font-mono"
          >
            {isSignUp ? '[CADASTRAR E ENTRAR]' : '[ENTRAR NO REINO]'}
          </button>
        </form>

        <div className="flex items-center my-4 w-full">
          <div className="flex-1 border-t border-amber-900/50" />
          <span className="px-3 text-[10px] text-amber-400/50 uppercase tracking-widest font-mono">[OU]</span>
          <div className="flex-1 border-t border-amber-900/50" />
        </div>

        {/* Botão de Convidado / Teste Rápido */}
        <button
          onClick={handleGuestPlay}
          className="w-full py-2 bg-[#1c1917] hover:bg-[#292524] border border-amber-800/70 hover:border-amber-500 rounded-lg text-amber-200 text-xs font-mono font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
        >
          [JOGAR COMO CONVIDADO • YUGI MUTO]
        </button>

        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
            }}
            className="text-xs text-amber-400/80 hover:text-amber-300 font-mono underline underline-offset-4 transition-colors cursor-pointer"
          >
            {isSignUp ? '[Já possui conta? Faça login aqui]' : '[Novo no Reino dos Duelistas? Crie sua conta]'}
          </button>
        </div>

      </div>
    </div>
  );
};
