import React, { useState, Component, ErrorInfo, ReactNode } from 'react';
import { AuthModal } from './components/AuthModal';
import { GameMenu } from './components/GameMenu';
import { Playmat } from './components/Playmat';
import { DeckBuilder } from './components/DeckBuilder';
import { getActiveDeckForDuel } from './utils/deckStorage';

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
          />
        )}
      </main>
    </ErrorBoundary>
  );
};

