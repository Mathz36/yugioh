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
      <div className="w-full max-w-md bg-[#100a1c] border-2 border-amber-500/80 rounded-2xl p-7 shadow-[0_0_50px_rgba(245,158,11,0.4)] flex flex-col items-center relative z-10 overflow-hidden">
        
        {/* Glow de fundo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Emblema do Olho do Milênio */}
        <div className="text-4xl text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.9)] mb-1">
          𓂀
        </div>
        <h1 className="text-2xl font-black font-serif tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 text-center">
          REINO DOS DUELISTAS
        </h1>
        <p className="text-xs text-purple-300/70 font-sans tracking-wide uppercase mt-1 mb-6">
          {isSignUp ? 'Criar Conta de Duelista' : 'Acesso à Arena Sagrada'}
        </p>

        {errorMsg && (
          <div className="w-full mb-4 px-3 py-2 bg-red-950/80 border border-red-500/60 rounded text-red-200 text-xs text-center font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold text-amber-300/80 uppercase tracking-wider mb-1">
              Nickname de Duelista
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Ex: Yugi Muto, Seto Kaiba, SeuNick"
              className="w-full bg-[#181026] border border-purple-800/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-amber-300/80 uppercase tracking-wider mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu-email@dominio.com"
              required
              className="w-full bg-[#181026] border border-purple-800/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-amber-300/80 uppercase tracking-wider mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-[#181026] border border-purple-800/80 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-amber-300 transition-transform active:scale-95"
          >
            {isSignUp ? 'Cadastrar e Entrar' : 'Entrar no Reino'}
          </button>
        </form>

        <div className="flex items-center my-4 w-full">
          <div className="flex-1 border-t border-purple-900/60" />
          <span className="px-3 text-[10px] text-purple-300/50 uppercase tracking-widest font-mono">OU</span>
          <div className="flex-1 border-t border-purple-900/60" />
        </div>

        {/* Botão de Convidado / Teste Rápido */}
        <button
          onClick={handleGuestPlay}
          className="w-full py-2 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-700/60 rounded-lg text-purple-200 text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
        >
          🎮 Jogar como Convidado (Yugi Muto)
        </button>

        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
            }}
            className="text-xs text-amber-400/90 hover:text-amber-300 underline underline-offset-4 transition-colors"
          >
            {isSignUp ? 'Já possui conta? Faça login aqui' : 'Novo no Reino dos Duelistas? Crie sua conta'}
          </button>
        </div>

      </div>
    </div>
  );
};
