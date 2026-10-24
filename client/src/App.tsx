import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { AuthModal } from './components/AuthModal';
import { GameMenu } from './components/GameMenu';
import { Playmat } from './components/Playmat';
import { DeckBuilder } from './components/DeckBuilder';
import { getActiveDeckForDuel } from './utils/deckStorage';
import {
  verifyHardwareAcceleration,
  HardwareAccelerationStatus,
} from './components/duel3d/webgpuCore';

export interface UserSession {
  email: string;
  nickname: string;
  isGuest?: boolean;
}

export type AppView = 'AUTH' | 'MENU' | 'DECK_BUILDER' | 'DUEL_BOT';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-red-400 p-8 text-center font-mono">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold mb-2 text-red-500">Erro na Interface de Duelo</h1>
          <p className="text-xs text-slate-300 mb-4 max-w-xl bg-black/60 p-4 rounded border border-red-900/60 break-words">
            {this.state.error?.message || 'Erro inesperado'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-bold text-xs uppercase"
          >
            Reiniciar Duelo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('AUTH');
  const [hwStatus, setHwStatus] = useState<HardwareAccelerationStatus | null>(null);

  useEffect(() => {
    verifyHardwareAcceleration().then(setHwStatus);
  }, []);

  const handleLoginSuccess = (user: UserSession) => {
    setCurrentUser(user);
    setCurrentView('MENU');
  };

  const handlePlayVsBot = () => {
    setCurrentView('DUEL_BOT');
  };

  const handleOpenDeckBuilder = () => {
    setCurrentView('DECK_BUILDER');
  };

  const handleExitToMenu = () => {
    setCurrentView('MENU');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('AUTH');
  };

  const activeDeckData = currentUser ? getActiveDeckForDuel(currentUser.nickname) : null;

  if (hwStatus && !hwStatus.supported) {
    return (
      <ErrorBoundary>
        <div
          data-testid="hardware-acceleration-guard"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c0a09]/95 backdrop-blur-md p-4 text-stone-100 select-none font-sans"
        >
          <div className="w-full max-w-lg rounded-2xl border-2 border-amber-800/80 bg-[#141210]/95 p-7 shadow-[0_8px_35px_rgba(0,0,0,0.92)] flex flex-col items-center text-center relative overflow-hidden backdrop-blur-md">
            <span className="inline-block px-3 py-1 mb-3 rounded bg-[#1c1917] border border-amber-700/60 text-[10px] font-mono font-black tracking-widest text-amber-300 uppercase">
              [REQUISITO GRÁFICO • ACELERAÇÃO 3D]
            </span>

            <h1 className="text-xl sm:text-2xl font-black font-serif tracking-wider text-amber-300 uppercase mb-2">
              Aceleração de Hardware Necessária
            </h1>

            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-4">
              O Reino dos Duelistas opera exclusivamente em 3D imersivo e exige que a{' '}
              <strong className="text-amber-400">Aceleração de Hardware (GPU)</strong> esteja ativa no seu navegador antes de prosseguir.
            </p>

            {hwStatus.reason && (
              <div className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-red-950/90 border border-red-700/80 text-red-200 text-xs font-mono">
                <span className="font-black text-red-400 mr-1.5">[DIAGNÓSTICO]</span>
                {hwStatus.reason}
              </div>
            )}

            <div className="w-full text-left bg-[#1c1917] border border-amber-900/60 rounded-xl p-4 mb-5 space-y-2.5 text-xs text-stone-300">
              <div className="text-[11px] font-mono font-black text-amber-400 uppercase tracking-wider">
                [COMO ATIVAR A GPU NO NAVEGADOR]
              </div>
              <div>
                <span className="font-bold text-amber-300">Chrome / Edge / Brave:</span> Acesse{' '}
                <code className="px-1.5 py-0.5 rounded bg-black/80 text-amber-400 font-mono text-[11px] border border-amber-900/40">
                  chrome://settings/system
                </code>{' '}
                e ative <em>&ldquo;Usar aceleração gráfica quando disponível&rdquo;</em>, depois reinicie o navegador.
              </div>
              <div>
                <span className="font-bold text-amber-300">Firefox:</span> Acesse{' '}
                <code className="px-1.5 py-0.5 rounded bg-black/80 text-amber-400 font-mono text-[11px] border border-amber-900/40">
                  about:preferences#general
                </code>{' '}
                em Desempenho e marque <em>&ldquo;Usar aceleração de hardware quando disponível&rdquo;</em>.
              </div>
            </div>

            <button
              type="button"
              onClick={() => verifyHardwareAcceleration().then(setHwStatus)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black font-mono text-xs sm:text-sm uppercase tracking-wider border border-amber-300 shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              [Verificar Aceleração de Hardware Novamente]
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <main className="w-full h-full min-h-screen bg-slate-950 overflow-hidden">
        {/* 1. Tela de Login / Cadastro */}
        {currentView === 'AUTH' && (
          <AuthModal onLoginSuccess={handleLoginSuccess} />
        )}

        {/* 2. Menu Principal de Jogo (Online, Deck Builder e Solo vs Bot) */}
        {currentView === 'MENU' && currentUser && (
          <GameMenu
            userNickname={currentUser.nickname}
            onPlayVsBot={handlePlayVsBot}
            onOpenDeckBuilder={handleOpenDeckBuilder}
            onLogout={handleLogout}
          />
        )}

        {/* 3. Construtor Visual de Decks */}
        {currentView === 'DECK_BUILDER' && currentUser && (
          <DeckBuilder
            userNickname={currentUser.nickname}
            onBackToMenu={handleExitToMenu}
          />
        )}

        {/* 4. Arena de Duelo (Playmat) com o Deck Principal Ativo do Jogador */}
        {currentView === 'DUEL_BOT' && currentUser && (
          <Playmat
            playerNickname={currentUser.nickname}
            playerDeck={activeDeckData?.cards}
            playerDeckName={activeDeckData?.deckName}
            onExitToMenu={handleExitToMenu}
            onHardwareError={(reason) =>
              setHwStatus({ supported: false, backend: 'NONE', reason })
            }
          />
        )}
      </main>
    </ErrorBoundary>
  );
};

