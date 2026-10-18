import React, { useState, useEffect } from 'react';
import { soundtrackManager } from '../utils/SoundtrackManager';
import { getUserSettings, saveUserSettings, UserSettings } from '../utils/settings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userNickname: string;
  onSettingsChanged?: (newSettings: UserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userNickname,
  onSettingsChanged,
}) => {
  const [settings, setSettings] = useState<UserSettings>(() => getUserSettings(userNickname));

  useEffect(() => {
    if (isOpen) {
      setSettings(getUserSettings(userNickname));
    }
  }, [isOpen, userNickname]);

  if (!isOpen) return null;

  const isPt = settings.language === 'pt';

  const handleToggleMute = () => {
    soundtrackManager.unlockAudioContext();
    const nextMuted = !settings.soundMuted;
    soundtrackManager.setMuted(nextMuted);

    const updated = saveUserSettings(userNickname, { soundMuted: nextMuted });
    setSettings(updated);
    onSettingsChanged?.(updated);
  };

  const handleSelectLanguage = (lang: 'pt' | 'en') => {
    if (settings.language === lang) return;
    const updated = saveUserSettings(userNickname, { language: lang });
    setSettings(updated);
    onSettingsChanged?.(updated);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#0c0914] border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.35)] flex flex-col items-center overflow-hidden">
        {/* Glow de fundo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Botão fechar 'X' no canto superior */}
        <button
          onClick={onClose}
          aria-label={isPt ? 'Fechar configurações' : 'Close settings'}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900/80 border border-slate-700 hover:border-amber-400 text-slate-400 hover:text-amber-300 flex items-center justify-center text-sm font-bold transition-all hover:scale-105"
        >
          ✕
        </button>

        {/* Ícone e Título */}
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-3xl text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]">
            ⚙️
          </span>
          <span className="text-2xl text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]">
            𓂀
          </span>
        </div>

        <h2
          id="settings-title"
          className="text-xl sm:text-2xl font-black font-serif tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 uppercase text-center"
        >
          {isPt ? 'Configurações' : 'Settings'}
        </h2>
        <p className="text-xs text-purple-300/80 font-mono tracking-wider mt-1 mb-6 text-center">
          {isPt ? 'Preferências de Áudio e Idioma' : 'Audio and Language Preferences'}
        </p>

        {/* Lista de Configurações */}
        <div className="w-full space-y-4">
          {/* 1. Trilha Sonora */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-purple-900/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-700/60 flex items-center justify-center text-xl">
                {settings.soundMuted ? '🔇' : '🎵'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200 font-serif tracking-wide">
                  {isPt ? 'Trilha Sonora' : 'Soundtrack Music'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {settings.soundMuted
                    ? isPt ? 'Áudio desativado' : 'Audio muted'
                    : isPt ? 'Música clássica em execução' : 'Classic music playing'}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleMute}
              className={`px-3.5 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border shadow-md flex items-center gap-1.5 ${
                settings.soundMuted
                  ? 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:brightness-110'
              }`}
            >
              <span>{settings.soundMuted ? 'Ativar' : 'Mutado'}</span>
            </button>
          </div>

          {/* 2. Idioma */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-purple-900/60 flex flex-col space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-xl">
                🌍
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-200 font-serif tracking-wide">
                  {isPt ? 'Idioma do Duelo' : 'Duel Language'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isPt
                    ? 'Nomes e descrições oficiais de cartas'
                    : 'Official card names and lore'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleSelectLanguage('pt')}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border ${
                  isPt
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>🇧🇷</span>
                <span>Português</span>
              </button>

              <button
                onClick={() => handleSelectLanguage('en')}
                className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border ${
                  !isPt
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>🇺🇸</span>
                <span>English</span>
              </button>
            </div>
          </div>
        </div>

        {/* Botão de Fechar / Salvo */}
        <div className="w-full mt-6 pt-4 border-t border-purple-900/50 flex items-center justify-between">
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
            <span>✓</span> {isPt ? 'Salvo no navegador' : 'Saved in browser'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105"
          >
            {isPt ? 'Concluir' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};

