import React from 'react';

interface GameMenuProps {
  userNickname: string;
  onPlayVsBot: () => void;
  onLogout: () => void;
}

export const GameMenu: React.FC<GameMenuProps> = ({ userNickname, onPlayVsBot, onLogout }) => {
  return (
    <div className="flex h-screen w-screen max-h-screen bg-[#07060a] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1b0e30] via-[#090710] to-[#030206] select-none text-slate-100 overflow-hidden font-sans items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#0e091a]/95 border-2 border-amber-500/70 rounded-3xl p-8 shadow-[0_0_60px_rgba(245,158,11,0.35)] flex flex-col items-center relative overflow-hidden backdrop-blur-md">
        
        {/* Adornos místicos de fundo */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Emblema do Olho do Milênio */}
        <div className="flex items-center space-x-3 mb-2">
          <span className="text-4xl text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)] animate-pulse">
            𓂀
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black font-serif tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 text-center uppercase">
          Reino dos Duelistas
        </h1>
        <p className="text-xs sm:text-sm text-purple-300/80 font-mono tracking-wider mt-1 mb-8 text-center">
          Bem-vindo, Duelista <span className="text-amber-300 font-bold">[{userNickname}]</span>
        </p>

        {/* Grade de Modos de Jogo */}
        <div className="w-full space-y-4">
          
          {/* Opção 1: Duelo Solo vs IA (Seto Kaiba Bot) */}
          <button
            onClick={onPlayVsBot}
            className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-950/60 via-purple-950/40 to-slate-900 border-2 border-amber-500/80 hover:border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-2xl shadow-lg border border-amber-300">
                🤖
              </div>
              <div>
                <h3 className="text-base font-extrabold text-amber-300 group-hover:text-amber-200 font-serif tracking-wide">
                  Duelo Solo (vs Bot)
                </h3>
                <p className="text-xs text-slate-300/80 mt-0.5">
                  Desafie a IA de Seto Kaiba com decks clássicos e regras sagradas.
                </p>
              </div>
            </div>
            <span className="text-amber-400 font-bold text-lg group-hover:translate-x-1 transition-transform pr-2">
              ➔
            </span>
          </button>

          {/* Opção 2: Duelo Online (PvP) - Em Breve */}
          <div className="w-full p-4 rounded-2xl bg-slate-950/60 border-2 border-purple-900/50 shadow-inner flex items-center justify-between text-left opacity-75 relative overflow-hidden">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-2xl text-purple-400">
                🌐
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-extrabold text-slate-300 font-serif tracking-wide">
                    Duelo Online (PvP)
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-900/70 text-purple-300 border border-purple-600/40">
                    Em Breve
                  </span>
                </div>
                <p className="text-xs text-slate-400/80 mt-0.5">
                  Partidas ranqueadas em tempo real contra duelistas ao redor do mundo.
                </p>
              </div>
            </div>
            <span className="text-purple-500 font-bold text-sm pr-2">🔒</span>
          </div>

        </div>

        {/* Rodapé do Menu com Botão de Sair */}
        <div className="mt-8 w-full flex items-center justify-between pt-4 border-t border-purple-900/50">
          <span className="text-[11px] text-purple-400/60 font-mono">
            Modo Competitivo • Regras Clássicas
          </span>
          <button
            onClick={onLogout}
            className="text-xs text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider hover:underline transition-colors"
          >
            Desconectar 🚪
          </button>
        </div>

      </div>
    </div>
  );
};
