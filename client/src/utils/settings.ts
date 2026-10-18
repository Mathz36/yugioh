export interface UserSettings {
  soundMuted: boolean;
  language: 'pt' | 'en';
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  soundMuted: false,
  language: 'pt',
};

const getStorageKey = (nickname?: string): string => {
  const cleanNick = nickname && nickname.trim() ? nickname.trim().toLowerCase() : 'guest';
  return `ygo_settings_${cleanNick}`;
};

/**
 * Retrieves persisted user settings from localStorage.
 * Falls back to default settings if none exist or on error.
 */
export const getUserSettings = (nickname?: string): UserSettings => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_USER_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(nickname));
    if (!raw) return { ...DEFAULT_USER_SETTINGS };

    const parsed = JSON.parse(raw);
    return {
      soundMuted: typeof parsed.soundMuted === 'boolean' ? parsed.soundMuted : DEFAULT_USER_SETTINGS.soundMuted,
      language: parsed.language === 'en' ? 'en' : 'pt',
    };
  } catch (err) {
    console.warn('[Settings] Failed to parse settings from localStorage:', err);
    return { ...DEFAULT_USER_SETTINGS };
  }
};

/**
 * Saves user settings into localStorage and returns the merged result.
 */
export const saveUserSettings = (
  nickname: string | undefined,
  settings: Partial<UserSettings>
): UserSettings => {
  const current = getUserSettings(nickname);
  const updated: UserSettings = {
    soundMuted: typeof settings.soundMuted === 'boolean' ? settings.soundMuted : current.soundMuted,
    language: settings.language === 'en' || settings.language === 'pt' ? settings.language : current.language,
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(getStorageKey(nickname), JSON.stringify(updated));
    } catch (err) {
      console.warn('[Settings] Failed to save settings to localStorage:', err);
    }
  }

  return updated;
};

