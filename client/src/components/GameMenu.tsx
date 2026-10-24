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
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none text-slate-100 font-sans">
      {/* 1. Background 3D WebGPU Nativo (VideoTexture + Partículas + Geometria Sagrada) */}
      <WebGPUBackdrop
        variant="menu"
        videoSrc="/video/banner.mp4"
        showBadge={true}
        className="z-0"
      />

      {/* 2. Aura sutil azulada para destacar o Dragão Branco de Olhos Azuis na direita */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[60vw] h-[80vh] bg-sky-500/10 rounded-full blur-[130px] pointer-events-none z-[2]" />

      {/* 3. Gradiente restrito apenas à coluna esquerda (deixando o palco 3D 100% limpo e em foco à direita) */}
      <div
        className="absolute inset-0 pointer-events-none z-[3]"
        style={{
          background:
            'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 26%, rgba(0,0,0,0.15) 48%, rgba(0,0,0,0) 70%)',
        }}
      />

      {/* 4. Coluna Lateral do Menu no Lado Esquerdo */}
      <aside className="relative z-10 h-full w-full max-w-sm sm:max-w-md flex flex-col justify-between p-6 sm:p-8 overflow-y-auto">
        
        {/* Topo: Emblema e Título */}
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <span className="text-4xl text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)] animate-pulse">
              𓂀
            </span>
            <div className="h-6 w-[2px] bg-amber-500/40" />
            <span className="text-xs font-mono tracking-widest text-amber-300/80 uppercase">
              Duel Monsters
            </span>
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black font-serif tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 uppercase drop-shadow-[0_2px_12px_rgba(245,158,11,0.4)]">
              {isPt ? 'Reino dos' : 'Duelist'}
              <br />
              {isPt ? 'Duelistas' : 'Kingdom'}
            </h1>
            <p className="text-xs sm:text-sm text-purple-300/80 font-mono tracking-wider mt-2">
              {isPt ? 'Bem-vindo, Duelista' : 'Welcome, Duelist'}{' '}
              <span className="text-amber-300 font-bold drop-shadow">[{userNickname}]</span>
            </p>
          </div>
        </div>

        {/* Centro: Opções Verticais de Console / Arcade */}
        <nav aria-label="Menu Principal" className="w-full space-y-3 sm:space-y-3.5 my-6 sm:my-8">
          
          {/* Opção 1: ⚔️ Duelo Solo (vs Bot - Seto Kaiba) com Destaque Dourado */}
          <button
            onClick={handleStartDuel}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-950/70 via-purple-950/50 to-slate-900/90 border-2 border-amber-400 hover:border-yellow-300 shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_40px_rgba(245,158,11,0.6)] transition-all duration-200 group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99]"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-2xl shadow-lg border border-amber-300 shrink-0 group-hover:rotate-6 transition-transform">
                ⚔️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-black text-amber-300 group-hover:text-amber-200 font-serif tracking-wide">
                    {isPt ? 'Duelo Solo (vs Bot)' : 'Solo Duel (vs Bot)'}
                  </h2>
                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded bg-amber-500 text-slate-950">
                    Kaiba
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5 leading-snug">
                  {isPt
                    ? 'Desafie a IA de Seto Kaiba com seu deck principal ativo.'
                    : 'Challenge Seto Kaiba AI with your active main deck.'}
                </p>
              </div>
            </div>
            <span className="text-amber-400 font-bold text-lg group-hover:translate-x-1.5 transition-transform pr-1">
              ➔
            </span>
          </button>

          {/* Opção 2: 🌐 Duelo Online (PvP) */}
          <div className="w-full p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-purple-900/50 flex items-center justify-between text-left opacity-70 hover:opacity-85 transition-opacity">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-950/70 border border-purple-700/50 flex items-center justify-center text-2xl text-purple-300 shrink-0">
                🌐
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-300 font-serif tracking-wide">
                    {isPt ? 'Duelo Online (PvP)' : 'Online Duel (PvP)'}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-900/80 text-purple-300 border border-purple-600/40">
                    {isPt ? 'Em Breve' : 'Coming Soon'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400/80 mt-0.5">
                  {isPt
                    ? 'Partidas competitivas em tempo real contra outros duelistas.'
                    : 'Real-time competitive matches against other duelists.'}
                </p>
              </div>
            </div>
            <span className="text-purple-400 text-sm font-bold pr-1">🔒</span>
          </div>

          {/* Opção 3: 🎴 Construtor de Decks (HABILITADO) */}
          <button
            onClick={handleOpenDeckBuilder}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-purple-950/85 via-slate-950/90 to-slate-900/90 border border-purple-500/60 hover:border-amber-400 shadow-[0_0_20px_rgba(147,51,234,0.25)] hover:shadow-[0_0_30px_rgba(245,158,11,0.45)] transition-all duration-200 group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-purple-700 to-indigo-900 border border-purple-400/60 flex items-center justify-center text-2xl text-amber-300 shrink-0 group-hover:scale-105 transition-transform shadow-md">
                🎴
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-amber-300 font-serif tracking-wide transition-colors">
                    {isPt ? 'Construtor de Decks' : 'Deck Builder'}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {isPt ? 'Novo' : 'New'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5">
                  {isPt
                    ? 'Monte até 3 decks personalizados e escolha seu Deck Principal ★.'
                    : 'Build up to 3 custom decks and select your Active Main Deck ★.'}
                </p>
              </div>
            </div>
            <span className="text-purple-300 group-hover:text-amber-400 font-bold text-lg transition-transform group-hover:translate-x-1 pr-1">
              ➔
            </span>
          </button>

          {/* Opção 4: ⚙️ Configurações */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 border border-slate-700/70 hover:border-amber-400/80 shadow-md transition-all group flex items-center justify-between text-left cursor-pointer transform hover:-translate-y-0.5"
          >
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl text-amber-300 shrink-0 group-hover:rotate-45 transition-transform duration-300">
                ⚙️
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-200 group-hover:text-amber-300 font-serif tracking-wide transition-colors">
                  {isPt ? 'Configurações' : 'Settings'}
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  {isPt
                    ? `Trilha: ${settings.soundMuted ? 'Mutada' : 'Ativa'} • Idioma: ${isPt ? 'PT-BR' : 'EN'}`
                    : `Music: ${settings.soundMuted ? 'Muted' : 'Active'} • Language: ${isPt ? 'PT-BR' : 'EN'}`}
                </p>
              </div>
            </div>
            <span className="text-slate-400 group-hover:text-amber-300 font-bold text-lg transition-transform group-hover:translate-x-1 pr-1">
              ➔
            </span>
          </button>

        </nav>

        {/* Rodapé: Botão de Desconectar e Informações */}
        <footer className="pt-4 border-t border-purple-900/40 flex items-center justify-between">
          <span className="text-[11px] text-purple-300/60 font-mono">
            {isPt ? 'Regras Oficiais • Reino dos Duelistas' : 'Official Rules • Duelist Kingdom'}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/60 font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            <span>🚪</span>
            <span>{isPt ? 'Desconectar' : 'Disconnect'}</span>
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
