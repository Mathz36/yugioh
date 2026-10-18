import { Howl, Howler } from 'howler';

export type MatchMusicTrack = 'EGYPT' | 'PASSWORD';

export class SoundtrackManager {
  private menuBgm: Howl | null = null;
  private matchBgmEgypt: Howl | null = null;
  private matchBgmPassword: Howl | null = null;
  private victorySfx: Howl | null = null;
  private defeatSfx: Howl | null = null;

  private currentTrack: 'MENU' | 'MATCH_EGYPT' | 'MATCH_PASSWORD' | 'NONE' = 'NONE';
  private masterVolume: number = 0.8;
  private isMuted: boolean = false;

  constructor() {
    this.initAudio();
  }

  private initAudio() {
    if (typeof window === 'undefined') return;

    this.menuBgm = new Howl({
      src: ['/audio/bgm_menu.mp3'],
      loop: true,
      volume: 0.7 * this.masterVolume,
      html5: true,
      preload: true,
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading menu BGM:', err),
    });

    this.matchBgmEgypt = new Howl({
      src: ['/audio/bgm_match_egypt.mp3'],
      loop: true,
      volume: 0.75 * this.masterVolume,
      html5: true,
      preload: true,
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading egypt match BGM:', err),
    });

    this.matchBgmPassword = new Howl({
      src: ['/audio/bgm_match_password.mp3'],
      loop: true,
      volume: 0.75 * this.masterVolume,
      html5: true,
      preload: true,
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading password match BGM:', err),
    });

    this.victorySfx = new Howl({
      src: ['/audio/sfx_victory.mp3'],
      loop: false,
      volume: 0.9 * this.masterVolume,
      html5: true,
      preload: true,
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading victory SFX:', err),
    });

    this.defeatSfx = new Howl({
      src: ['/audio/sfx_defeat.mp3'],
      loop: false,
      volume: 0.9 * this.masterVolume,
      html5: true,
      preload: true,
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading defeat SFX:', err),
    });
  }

  public unlockAudioContext() {
    if (typeof Howler !== 'undefined' && Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume();
    }
  }

  public playMenuMusic(fadeDurationMs: number = 800) {
    this.unlockAudioContext();
    if (this.currentTrack === 'MENU') return;

    this.stopCurrentMusic(400);
    this.currentTrack = 'MENU';

    if (this.menuBgm && !this.isMuted) {
      const targetVol = 0.7 * this.masterVolume;
      this.menuBgm.volume(targetVol);
      this.menuBgm.play();
    }
  }

  public playMatchMusic(track?: MatchMusicTrack, fadeDurationMs: number = 800) {
    this.unlockAudioContext();
    const chosenTrack: MatchMusicTrack = track || (Math.random() > 0.5 ? 'EGYPT' : 'PASSWORD');
    const trackKey = chosenTrack === 'EGYPT' ? 'MATCH_EGYPT' : 'MATCH_PASSWORD';

    if (this.currentTrack === trackKey) return;

    this.stopCurrentMusic(400);
    this.currentTrack = trackKey;

    const bgm = chosenTrack === 'EGYPT' ? this.matchBgmEgypt : this.matchBgmPassword;
    if (bgm && !this.isMuted) {
      const targetVol = 0.75 * this.masterVolume;
      bgm.volume(targetVol);
      bgm.play();
    }
  }

  public playVictory() {
    this.unlockAudioContext();
    this.stopCurrentMusic(200);
    if (this.victorySfx && !this.isMuted) {
      this.victorySfx.stop();
      this.victorySfx.volume(0.9 * this.masterVolume);
      this.victorySfx.play();
    }
  }

  public playDefeat() {
    this.unlockAudioContext();
    this.stopCurrentMusic(200);
    if (this.defeatSfx && !this.isMuted) {
      this.defeatSfx.stop();
      this.defeatSfx.volume(0.9 * this.masterVolume);
      this.defeatSfx.play();
    }
  }

  public stopCurrentMusic(fadeDurationMs: number = 400) {
    const prev = this.currentTrack;
    this.currentTrack = 'NONE';

    const howl =
      prev === 'MENU'
        ? this.menuBgm
        : prev === 'MATCH_EGYPT'
        ? this.matchBgmEgypt
        : prev === 'MATCH_PASSWORD'
        ? this.matchBgmPassword
        : null;

    if (howl) {
      try {
        howl.stop();
      } catch {
        // Safe stop
      }
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    Howler.mute(muted);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getCurrentTrack() {
    return this.currentTrack;
  }
}

export const soundtrackManager = new SoundtrackManager();

