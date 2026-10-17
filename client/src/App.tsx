import React, { useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { GameMenu } from './components/GameMenu';
import { Playmat } from './components/Playmat';

export interface UserSession {
  email: string;
  nickname: string;
  isGuest?: boolean;
}

export type AppView = 'AUTH' | 'MENU' | 'DUEL_BOT';

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

  const handleExitToMenu = () => {
    setCurrentView('MENU');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('AUTH');
  };

  return (
    <main className="w-full h-full min-h-screen bg-slate-950 overflow-hidden">
      {/* 1. Tela de Login / Cadastro */}
      {currentView === 'AUTH' && (
        <AuthModal onLoginSuccess={handleLoginSuccess} />
      )}

      {/* 2. Menu Principal de Jogo (Online e Solo vs Bot) */}
      {currentView === 'MENU' && currentUser && (
        <GameMenu
          userNickname={currentUser.nickname}
          onPlayVsBot={handlePlayVsBot}
          onLogout={handleLogout}
        />
      )}

      {/* 3. Arena de Duelo (Playmat) */}
      {currentView === 'DUEL_BOT' && currentUser && (
        <Playmat
          playerNickname={currentUser.nickname}
          onExitToMenu={handleExitToMenu}
        />
      )}
    </main>
  );
};
