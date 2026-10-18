import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserSettings, saveUserSettings, DEFAULT_USER_SETTINGS } from './settings';

// Mock localStorage for Node test runner
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

describe('UserSettings Persistence (settings.ts)', () => {
  let storageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    storageMock = createLocalStorageMock();
    vi.stubGlobal('window', {
      localStorage: storageMock,
    });
    vi.stubGlobal('localStorage', storageMock);
  });

  it('should return default settings when nothing is in localStorage', () => {
    const settings = getUserSettings('Yugi');
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(settings.soundMuted).toBe(false);
    expect(settings.language).toBe('pt');
  });

  it('should return default settings for empty or guest nickname', () => {
    const settings = getUserSettings('');
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('should save and retrieve soundMuted setting', () => {
    saveUserSettings('Yugi', { soundMuted: true });
    const settings = getUserSettings('Yugi');
    expect(settings.soundMuted).toBe(true);
    expect(settings.language).toBe('pt');
  });

  it('should save and retrieve language setting', () => {
    saveUserSettings('Kaiba', { language: 'en' });
    const settings = getUserSettings('Kaiba');
    expect(settings.soundMuted).toBe(false);
    expect(settings.language).toBe('en');
  });

  it('should isolate settings between different nicknames (case-insensitive)', () => {
    saveUserSettings('Yugi', { soundMuted: true, language: 'en' });
    saveUserSettings('Joey', { soundMuted: false, language: 'pt' });

    expect(getUserSettings('yugi')).toEqual({ soundMuted: true, language: 'en' });
    expect(getUserSettings('JOEY')).toEqual({ soundMuted: false, language: 'pt' });
  });

  it('should gracefully handle malformed JSON in localStorage', () => {
    storageMock.setItem('ygo_settings_corrupted', '{ invalid-json');
    const settings = getUserSettings('corrupted');
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
  });
});

