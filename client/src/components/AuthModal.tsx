import React, { useState } from 'react';
import { WebGPUBackdrop } from './duel3d/WebGPUBackdrop';
import { supabase, isSupabaseConfigured } from '../supabase';

export interface AuthSuccessPayload {
  id?: string;
  email: string;
  nickname: string;
  isGuest?: boolean;
}

interface AuthModalProps {
  onLoginSuccess: (user: AuthSuccessPayload) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState(() => localStorage.getItem('ygo_last_email') || '');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(() => localStorage.getItem('ygo_last_nickname') || '');
  const [isSignUp, setIsSignUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const translateAuthError = (message: string): string => {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
      return 'E-mail ou senha incorretos.';
    }
    if (lower.includes('user already registered') || lower.includes('already exists')) {
      return 'Este e-mail já está cadastrado no Reino dos Duelistas. Tente fazer login.';
    }
    if (lower.includes('password should be at least 6 characters') || lower.includes('at least 6 characters')) {
      return 'A senha deve conter no mínimo 6 caracteres.';
    }
    if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
      return 'E-mail ainda não confirmado. Verifique sua caixa de entrada para ativar sua conta.';
    }
    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Muitas tentativas em sequência. Por favor, aguarde alguns instantes.';
    }
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    const resolvedNickname = nickname.trim() || cleanEmail.split('@')[0] || 'Duelista';

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Por favor, preencha o e-mail e a senha.');
      return;
    }

    if (cleanPassword.length < 6) {
      setErrorMsg('A senha de duelista deve conter no mínimo 6 caracteres.');
      return;
    }

    // If Supabase is configured, authenticate securely via Supabase Auth
    if (isSupabaseConfigured && supabase) {
      setIsLoading(true);
      try {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPassword,
            options: {
              data: {
                nickname: resolvedNickname,
              },
            },
          });

          if (error) {
            setErrorMsg(translateAuthError(error.message));
            setIsLoading(false);
            return;
          }

          if (data.session && data.user) {
            localStorage.setItem('ygo_last_email', cleanEmail);
            localStorage.setItem('ygo_last_nickname', resolvedNickname);
            onLoginSuccess({
              id: data.user.id,
              email: cleanEmail,
              nickname: resolvedNickname,
              isGuest: false,
            });
            return;
          }

          if (data.user) {
            setSuccessMsg(
              'Conta criada com sucesso! Caso a confirmação de e-mail esteja ativada no Supabase, verifique sua caixa de entrada antes de fazer login.'
            );
            setIsSignUp(false);
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword,
          });

          if (error) {
            setErrorMsg(translateAuthError(error.message));
            setIsLoading(false);
            return;
          }

          if (data.session && data.user) {
            const userNick =
              data.user.user_metadata?.nickname ||
              resolvedNickname;
            localStorage.setItem('ygo_last_email', cleanEmail);
            localStorage.setItem('ygo_last_nickname', userNick);
            onLoginSuccess({
              id: data.user.id,
              email: cleanEmail,
              nickname: userNick,
              isGuest: false,
            });
            return;
          }
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Falha na conexão com o servidor de autenticação.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Local fallback when Supabase keys are not configured
    localStorage.setItem('ygo_last_email', cleanEmail);
    localStorage.setItem('ygo_last_nickname', resolvedNickname);
    onLoginSuccess({
      email: cleanEmail,
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
      <WebGPUBackdrop variant="auth" className="z-0" />
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
        <p className="text-[10px] text-amber-200/70 font-mono tracking-widest uppercase mt-1 mb-2">
          {isSignUp ? '[CRIAR CONTA DE DUELISTA]' : '[ACESSO À ARENA SAGRADA]'}
        </p>

        {isSupabaseConfigured ? (
          <span className="inline-block px-2.5 py-0.5 mb-5 rounded bg-black/60 border border-emerald-600/40 text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
            ● [NUVEM SEGURA ATIVA • SUPABASE AUTH]
          </span>
        ) : (
          <span
            className="inline-block px-2.5 py-0.5 mb-5 rounded bg-amber-950/60 border border-amber-600/40 text-[9px] font-mono text-amber-300 font-bold uppercase tracking-wider"
            title="Para ativar a nuvem, configure SUPABASE_URL e SUPABASE_ANON_KEY (ou VITE_SUPABASE_*) na Vercel ou no .env"
          >
            ⚠️ [MODO LOCAL OFFLINE • SUPABASE DESCONECTADO]
          </span>
        )}

        {errorMsg && (
          <div className="w-full mb-4 px-3 py-2 bg-red-950/90 border border-red-700/80 rounded text-red-200 text-xs text-center font-mono font-medium leading-relaxed">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="w-full mb-4 px-3 py-2 bg-emerald-950/90 border border-emerald-700/80 rounded text-emerald-200 text-xs text-center font-mono font-medium leading-relaxed">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-3.5">
          {isSignUp && (
            <div>
              <label className="block text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
                Nickname de Duelista
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex: Yugi Muto, Seto Kaiba, SeuNick"
                required={isSignUp}
                disabled={isLoading}
                className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono disabled:opacity-50"
              />
            </div>
          )}

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
              disabled={isLoading}
              className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-1">
              Senha (Mínimo 6 caracteres)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={isLoading}
              minLength={6}
              className="w-full bg-[#1c1917] border border-amber-900/60 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-mono disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 mt-2 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-lg border border-amber-300 transition-all cursor-pointer active:scale-95 font-mono disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                CONECTANDO AO REINO...
              </span>
            ) : isSignUp ? (
              '[CADASTRAR E ENTRAR]'
            ) : (
              '[ENTRAR NO REINO]'
            )}
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
          disabled={isLoading}
          className="w-full py-2 bg-[#1c1917] hover:bg-[#292524] border border-amber-800/70 hover:border-amber-500 rounded-lg text-amber-200 text-xs font-mono font-black uppercase tracking-wider transition-colors shadow-sm cursor-pointer disabled:opacity-50"
        >
          [JOGAR COMO CONVIDADO • YUGI MUTO]
        </button>

        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            disabled={isLoading}
            className="text-xs text-amber-400/80 hover:text-amber-300 font-mono underline underline-offset-4 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isSignUp ? '[Já possui conta? Faça login aqui]' : '[Novo no Reino dos Duelistas? Crie sua conta]'}
          </button>
        </div>

      </div>
    </div>
  );
};
