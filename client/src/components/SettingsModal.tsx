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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-[#141210]/95 border-2 border-amber-800/80 rounded-2xl p-6 sm:p-8 shadow-[0_8px_35px_rgba(0,0,0,0.92)] flex flex-col items-center overflow-hidden backdrop-blur-md">
        {/* Glow atmosférico suave Dark Stone & Aged Gold */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

        {/* Botão fechar '[X]' no canto superior */}
        <button
          onClick={onClose}
          aria-label={isPt ? 'Fechar configurações' : 'Close settings'}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#1c1917] border border-amber-900/60 hover:border-amber-500 text-stone-400 hover:text-amber-300 flex items-center justify-center font-mono text-xs font-black transition-all cursor-pointer"
        >
          [X]
        </button>

        {/* Emblema e Título */}
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-3xl text-amber-400 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]">
            𓂀
          </span>
        </div>

        <h2
          id="settings-title"
          className="text-xl sm:text-2xl font-black font-serif tracking-widest text-amber-300 uppercase text-center"
        >
          {isPt ? 'Configurações' : 'Settings'}
        </h2>
        <p className="text-[10px] text-amber-200/70 font-mono tracking-widest mt-1 mb-6 text-center uppercase">
          {isPt ? '[PREFERÊNCIAS DE ÁUDIO E IDIOMA]' : '[AUDIO AND LANGUAGE PREFERENCES]'}
        </p>

        {/* Lista de Configurações */}
        <div className="w-full space-y-3.5">
          {/* 1. Trilha Sonora */}
          <div className="p-3.5 rounded-xl bg-[#1c1917] border border-amber-900/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-[#292524] border border-amber-700/60 flex items-center justify-center font-mono text-xs font-black text-amber-300 shrink-0">
                [SOM]
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-200 font-serif tracking-wide">
                  {isPt ? 'Trilha Sonora' : 'Soundtrack Music'}
                </h3>
                <p className="text-[11px] text-stone-400 font-mono">
                  {settings.soundMuted
                    ? isPt ? '[Áudio mutado]' : '[Audio muted]'
                    : isPt ? '[Música ativa]' : '[Music active]'}
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleMute}
              className={`px-3 py-1.5 rounded-lg font-mono font-black text-xs uppercase tracking-wider transition-all border shadow-sm cursor-pointer ${
                settings.soundMuted
                  ? 'bg-[#292524] border-stone-700 text-stone-400 hover:text-stone-200'
                  : 'bg-gradient-to-b from-amber-500 to-amber-600 text-stone-950 border-amber-300'
              }`}
            >
              <span>{settings.soundMuted ? '[ATIVAR]' : '[MUTAR]'}</span>
            </button>
          </div>

          {/* 2. Idioma */}
          <div className="p-3.5 rounded-xl bg-[#1c1917] border border-amber-900/60 flex flex-col space-y-2.5">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-[#292524] border border-amber-700/60 flex items-center justify-center font-mono text-xs font-black text-amber-300 shrink-0">
                [IDM]
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-200 font-serif tracking-wide">
                  {isPt ? 'Idioma do Duelo' : 'Duel Language'}
                </h3>
                <p className="text-[11px] text-stone-400 font-mono">
                  {isPt
                    ? 'Nomes e descrições oficiais de cartas'
                    : 'Official card names and lore'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleSelectLanguage('pt')}
                className={`py-2 px-3 rounded-lg font-mono font-black text-xs flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                  isPt
                    ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-stone-950 border-amber-300 shadow'
                    : 'bg-[#292524] border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                <span>[PT-BR] Português</span>
              </button>

              <button
                onClick={() => handleSelectLanguage('en')}
                className={`py-2 px-3 rounded-lg font-mono font-black text-xs flex items-center justify-center gap-1.5 transition-all border cursor-pointer ${
                  !isPt
                    ? 'bg-gradient-to-b from-amber-500 to-amber-600 text-stone-950 border-amber-300 shadow'
                    : 'bg-[#292524] border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                <span>[EN-US] English</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rodapé: Concluir */}
        <div className="w-full mt-6 pt-4 border-t border-amber-900/50 flex items-center justify-between">
          <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
            <span>[OK]</span> {isPt ? 'Salvo no navegador' : 'Saved in browser'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black font-mono text-xs uppercase tracking-wider rounded-lg shadow border border-amber-300 cursor-pointer"
          >
            {isPt ? '[CONCLUIR]' : '[DONE]'}
          </button>
        </div>
      </div>
    </div>
  );
};

