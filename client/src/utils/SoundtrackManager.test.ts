import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Howl, Howler } from 'howler';
import { SoundtrackManager } from './SoundtrackManager';

vi.mock('howler', () => {
  return {
    Howler: {
      ctx: {
        state: 'running',
        resume: vi.fn(),
      },
      mute: vi.fn(),
    },
    Howl: vi.fn().mockImplementation(function (options: any) {
      let _volume = options.volume ?? 1;
      let _isPlaying = false;

      return {
        _options: options,
        play: vi.fn().mockImplementation(() => {
          _isPlaying = true;
          return 1;
        }),
        stop: vi.fn().mockImplementation(() => {
          _isPlaying = false;
        }),
        volume: vi.fn().mockImplementation((val?: number) => {
          if (typeof val === 'number') {
            _volume = val;
            return undefined;
          }
          return _volume;
        }),
        fade: vi.fn().mockImplementation((from: number, to: number, duration: number) => {
          _volume = to;
        }),
      };
    }),
  };
});

describe('SoundtrackManager - Authentic Yu-Gi-Oh Forbidden Memories OST', () => {
  let manager: SoundtrackManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new SoundtrackManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Arrange: initial state, Act: playMenuMusic, Assert: plays menu bgm and sets track to MENU', () => {
    manager.playMenuMusic();
    expect(manager.getCurrentTrack()).toBe('MENU');
  });

  it('Arrange: playing menu music, Act: playMatchMusic("EGYPT"), Assert: transitions track to MATCH_EGYPT', () => {
    manager.playMenuMusic();
    manager.playMatchMusic('EGYPT');
    expect(manager.getCurrentTrack()).toBe('MATCH_EGYPT');
  });

  it('Arrange: playing match music, Act: playMatchMusic("PASSWORD"), Assert: switches track to MATCH_PASSWORD', () => {
    manager.playMatchMusic('PASSWORD');
    expect(manager.getCurrentTrack()).toBe('MATCH_PASSWORD');
  });

  it('Arrange: match concludes with win, Act: playVictory, Assert: stops music and plays victory sfx', () => {
    manager.playMatchMusic('EGYPT');
    manager.playVictory();
    expect(manager.getCurrentTrack()).toBe('NONE');
  });

  it('Arrange: match concludes with loss, Act: playDefeat, Assert: stops music and plays defeat sfx', () => {
    manager.playMatchMusic('PASSWORD');
    manager.playDefeat();
    expect(manager.getCurrentTrack()).toBe('NONE');
  });

  it('Arrange: manager initialized, Act: setMuted(true), Assert: invokes Howler.mute', () => {
    manager.setMuted(true);
    expect(manager.getIsMuted()).toBe(true);
    expect(Howler.mute).toHaveBeenCalledWith(true);
  });
});

