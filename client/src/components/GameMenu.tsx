import React, { useEffect, useState } from 'react';
import { soundtrackManager } from '../utils/SoundtrackManager';
import { getUserSettings, UserSettings } from '../utils/settings';
import { SettingsModal } from './SettingsModal';
import { WebGPUBackdrop } from './duel3d/WebGPUBackdrop';

interface GameMenuProps {
  userNickname: string;
  onPlayVsBot: () => void;
  onOpenDeckBuilder: () => void;
  onLogout: () => void;
}

export const GameMenu: React.FC<GameMenuProps> = ({
  userNickname,
  onPlayVsBot,
  onOpenDeckBuilder,
  onLogout,
}) => {
  const [settings, setSettings] = useState<UserSettings>(() => getUserSettings(userNickname));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const currentSettings = getUserSettings(userNickname);
    setSettings(currentSettings);
    soundtrackManager.setMuted(currentSettings.soundMuted);
    soundtrackManager.playMenuMusic();
  }, [userNickname]);

  const handleStartDuel = () => {
    soundtrackManager.unlockAudioContext();
    onPlayVsBot();
  };

  const handleOpenDeckBuilder = () => {
    soundtrackManager.unlockAudioContext();
    onOpenDeckBuilder();
  };

  const handleSettingsChanged = (newSettings: UserSettings) => {
    setSettings(newSettings);
  };

  const isPt = settings.language === 'pt';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0c0a09] select-none text-stone-100 font-sans">
      {/* 1. Background 3D WebGPU Nativo (VideoTexture + Partículas + Geometria Sagrada) */}
      <WebGPUBackdrop
        variant="menu"
        videoSrc="/video/banner.mp4"
        showBadge={true}
        className="z-0"
      />

      {/* 2. Gradiente Dark Stone restrito apenas à coluna esquerda */}
      <div
        className="absolute inset-0 pointer-events-none z-[3]"
        style={{
          background:
            'linear-gradient(90deg, rgba(12,10,9,0.95) 0%, rgba(20,18,16,0.85) 28%, rgba(20,18,16,0.2) 50%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* 3. Coluna Lateral do Menu no Lado Esquerdo (Dark Stone & Aged Gold Tablet) */}
      <aside className="relative z-10 h-full w-full max-w-sm sm:max-w-md flex flex-col justify-between p-6 sm:p-8 overflow-y-auto bg-[#141210]/95 border-r border-amber-900/60 shadow-[8px_0_35px_rgba(0,0,0,0.85)] backdrop-blur-md">
        
        {/* Topo: Emblema e Título */}
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <span className="text-4xl text-amber-400 drop-shadow-[0_2px_12px_rgba(245,158,11,0.5)]">
              𓂀
            </span>
            <div className="h-6 w-[2px] bg-amber-600/40" />
            <span className="text-xs font-mono tracking-widest text-amber-400/80 uppercase">
              [DUEL MONSTERS]
            </span>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-serif tracking-wider text-amber-300 uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {isPt ? 'Reino dos' : 'Duelist'}
              <br />
              {isPt ? 'Duelistas' : 'Kingdom'}
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 font-mono tracking-wider mt-2">
              {isPt ? 'Bem-vindo, Duelista' : 'Welcome, Duelist'}{' '}
              <span className="text-amber-400 font-bold">[{userNickname}]</span>
            </p>
          </div>
        </div>

        {/* Centro: Opções Verticais do Menu Tático */}
        <nav aria-label="Menu Principal" className="w-full space-y-3 sm:space-y-3.5 my-6 sm:my-8">
          
          {/* Opção 1: [SOLO] Duelo Solo (vs Bot - Seto Kaiba) */}
          <button
            onClick={handleStartDuel}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#1c1917] to-[#141210] border-2 border-amber-600/80 hover:border-amber-400 shadow-[0_4px_25px_rgba(0,0,0,0.85)] hover:shadow-[0_4px_30px_rgba(245,158,11,0.25)] transition-all duration-200 group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5 active:scale-[0.99]"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#292524] border border-amber-600/80 flex items-center justify-center font-mono font-black text-amber-300 text-xs shadow-inner uppercase shrink-0 group-hover:scale-105 transition-transform">
                [SOLO]
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-amber-300 group-hover:text-amber-200 font-serif tracking-wide">
                    {isPt ? 'Duelo Solo (vs Bot)' : 'Solo Duel (vs Bot)'}
                  </h2>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-black uppercase tracking-wider rounded bg-amber-500 text-stone-950">
                    [BOT • KAIBA]
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-stone-300/80 mt-0.5 leading-snug">
                  {isPt
                    ? 'Desafie a IA de Seto Kaiba com seu deck principal ativo.'
                    : 'Challenge Seto Kaiba AI with your active main deck.'}
                </p>
              </div>
            </div>
            <span className="text-amber-400 font-mono font-black text-sm group-hover:translate-x-1.5 transition-transform pr-1">
              [➔]
            </span>
          </button>

          {/* Opção 2: [PVP] Duelo Online (PvP) */}
          <div className="w-full p-3.5 sm:p-4 rounded-2xl bg-[#141210]/80 border border-stone-800/80 flex items-center justify-between text-left opacity-60">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#1c1917] border border-stone-800 flex items-center justify-center font-mono font-bold text-stone-500 text-xs shrink-0">
                [PVP]
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm sm:text-base font-bold text-stone-400 font-serif tracking-wide">
                    {isPt ? 'Duelo Online (PvP)' : 'Online Duel (PvP)'}
                  </h2>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wider bg-stone-800 text-stone-400 border border-stone-700">
                    {isPt ? '[EM BREVE]' : '[SOON]'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-stone-500 mt-0.5">
                  {isPt
                    ? 'Partidas competitivas em tempo real contra outros duelistas.'
                    : 'Real-time competitive matches against other duelists.'}
                </p>
              </div>
            </div>
            <span className="text-stone-500 font-mono text-[10px] font-bold pr-1">
              {isPt ? '[BLOQUEADO]' : '[LOCKED]'}
            </span>
          </div>

          {/* Opção 3: [DECK] Construtor de Decks */}
          <button
            onClick={handleOpenDeckBuilder}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-[#1c1917]/90 border border-amber-800/70 hover:border-amber-500 shadow-md hover:shadow-[0_4px_20px_rgba(245,158,11,0.25)] transition-all duration-200 group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#292524] border border-amber-700/60 flex items-center justify-center font-mono font-black text-amber-300 text-xs shadow-inner uppercase shrink-0 group-hover:scale-105 transition-transform">
                [DECK]
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm sm:text-base font-bold text-stone-100 group-hover:text-amber-300 font-serif tracking-wide transition-colors">
                    {isPt ? 'Construtor de Decks' : 'Deck Builder'}
                  </h2>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-700/60">
                    {isPt ? '[3 DECKS]' : '[3 SLOTS]'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-stone-300/80 mt-0.5">
                  {isPt
                    ? 'Monte até 3 decks personalizados e escolha seu Deck Principal ★.'
                    : 'Build up to 3 custom decks and select your Active Main Deck ★.'}
                </p>
              </div>
            </div>
            <span className="text-stone-400 group-hover:text-amber-400 font-mono font-black text-sm transition-transform group-hover:translate-x-1.5 pr-1">
              [➔]
            </span>
          </button>

          {/* Opção 4: [CFG] Configurações */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-[#141210]/95 border border-stone-800 hover:border-amber-700/70 shadow-md transition-all group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#1c1917] border border-stone-700 flex items-center justify-center font-mono font-black text-stone-300 text-xs shadow-inner uppercase shrink-0">
                [CFG]
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-stone-200 group-hover:text-amber-300 font-serif tracking-wide transition-colors">
                  {isPt ? 'Configurações' : 'Settings'}
                </h2>
                <p className="text-[11px] sm:text-xs text-stone-400 mt-0.5 font-mono">
                  {isPt
                    ? `Trilha: ${settings.soundMuted ? 'Mudo' : 'Ativa'} • Idioma: ${isPt ? 'PT-BR' : 'EN'}`
                    : `Music: ${settings.soundMuted ? 'Muted' : 'Active'} • Language: ${isPt ? 'PT-BR' : 'EN'}`}
                </p>
              </div>
            </div>
            <span className="text-stone-400 group-hover:text-amber-300 font-mono font-black text-sm transition-transform group-hover:translate-x-1.5 pr-1">
              [➔]
            </span>
          </button>

        </nav>

        {/* Rodapé: Botão de Desconectar e Informações */}
        <footer className="pt-4 border-t border-amber-900/40 flex items-center justify-between">
          <span className="text-[10px] text-amber-400/60 font-mono uppercase tracking-wider">
            {isPt ? '[REINO DOS DUELISTAS]' : '[DUELIST KINGDOM]'}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] text-red-400 hover:text-red-200 bg-[#1c1917] hover:bg-red-950/40 border border-stone-800 hover:border-red-900/60 font-mono font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            <span>[SAIR]</span>
          </button>
        </footer>

      </aside>

      {/* Modal de Configurações Persistentes */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userNickname={userNickname}
        onSettingsChanged={handleSettingsChanged}
      />
    </div>
  );
};
