import { Howl, Howler } from 'howler';

export type MatchMusicTrack = 'EGYPT' | 'PASSWORD';

export class SoundtrackManager {
  private menuBgm: Howl | null = null;
  private matchBgmEgypt: Howl | null = null;
  private matchBgmPassword: Howl | null = null;
  private victorySfx: Howl | null = null;
  private defeatSfx: Howl | null = null;

  private currentTrack: 'MENU' | 'MATCH_EGYPT' | 'MATCH_PASSWORD' | 'VICTORY' | 'DEFEAT' | 'NONE' = 'NONE';
  private masterVolume: number = 0.8;
  private isMuted: boolean = false;

  // Fila de reprodução sequencial da partida (Egypt <-> Password)
  private matchPlaylist: MatchMusicTrack[] = ['EGYPT', 'PASSWORD'];
  private currentMatchPlaylistIndex: number = 0;

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
      loop: false, // Fila sequencial (onend aciona a próxima faixa)
      volume: 0.75 * this.masterVolume,
      html5: true,
      preload: true,
      onend: () => {
        this.handleMatchTrackEnded('EGYPT');
      },
      onloaderror: (_id, err) => console.warn('[Soundtrack] Error loading egypt match BGM:', err),
    });

    this.matchBgmPassword = new Howl({
      src: ['/audio/bgm_match_password.mp3'],
      loop: false, // Fila sequencial (onend aciona a próxima faixa)
      volume: 0.75 * this.masterVolume,
      html5: true,
      preload: true,
      onend: () => {
        this.handleMatchTrackEnded('PASSWORD');
      },
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

  /**
   * Pára estritamente todos os áudios que possam estar tocando
   */
  public stopAllTracks() {
    const allHowls = [
      this.menuBgm,
      this.matchBgmEgypt,
      this.matchBgmPassword,
      this.victorySfx,
      this.defeatSfx,
    ];
    for (const howl of allHowls) {
      if (howl) {
        try {
          howl.stop();
        } catch {
          // ignore safe error
        }
      }
    }
    this.currentTrack = 'NONE';
  }

  /**
   * Música do Menu Principal (intocada, em loop contínuo)
   */
  public playMenuMusic() {
    this.unlockAudioContext();
    if (this.currentTrack === 'MENU') return;

    this.stopAllTracks();
    this.currentTrack = 'MENU';

    if (this.menuBgm && !this.isMuted) {
      const targetVol = 0.7 * this.masterVolume;
      this.menuBgm.volume(targetVol);
      this.menuBgm.play();
    }
  }

  /**
   * Inicia ou avança a fila de reprodução da partida
   */
  public playMatchMusic(track?: MatchMusicTrack) {
    this.unlockAudioContext();

    // Se já estiver tocando uma música de partida válida, não sobrepõe
    if (!track && (this.currentTrack === 'MATCH_EGYPT' || this.currentTrack === 'MATCH_PASSWORD')) {
      return;
    }

    let chosenTrack: MatchMusicTrack;
    if (track) {
      chosenTrack = track;
      this.currentMatchPlaylistIndex = this.matchPlaylist.indexOf(track);
      if (this.currentMatchPlaylistIndex === -1) {
        this.currentMatchPlaylistIndex = 0;
      }
    } else {
      chosenTrack = this.matchPlaylist[this.currentMatchPlaylistIndex];
    }

    const trackKey = chosenTrack === 'EGYPT' ? 'MATCH_EGYPT' : 'MATCH_PASSWORD';
    if (this.currentTrack === trackKey) return;

    this.stopAllTracks();
    this.currentTrack = trackKey;

    const bgm = chosenTrack === 'EGYPT' ? this.matchBgmEgypt : this.matchBgmPassword;
    if (bgm && !this.isMuted) {
      const targetVol = 0.75 * this.masterVolume;
      bgm.volume(targetVol);
      bgm.play();
    }
  }

  /**
   * Avança a fila quando uma música de partida termina
   */
  private handleMatchTrackEnded(endedTrack: MatchMusicTrack) {
    // Garante que só avança se a partida ainda estiver ativa (não terminou com vitória/derrota/menu)
    const expectedKey = endedTrack === 'EGYPT' ? 'MATCH_EGYPT' : 'MATCH_PASSWORD';
    if (this.currentTrack !== expectedKey) return;

    // Próxima faixa na fila circular (Egypt -> Password -> Egypt -> ...)
    this.currentMatchPlaylistIndex = (this.currentMatchPlaylistIndex + 1) % this.matchPlaylist.length;
    const nextTrack = this.matchPlaylist[this.currentMatchPlaylistIndex];
    this.playMatchMusic(nextTrack);
  }

  /**
   * Toca exclusivamente o tema de vitória
   */
  public playVictory() {
    this.unlockAudioContext();
    this.stopAllTracks();
    this.currentTrack = 'VICTORY';

    if (this.victorySfx && !this.isMuted) {
      this.victorySfx.stop();
      this.victorySfx.volume(0.9 * this.masterVolume);
      this.victorySfx.play();
    }
  }

  /**
   * Toca exclusivamente o tema de derrota
   */
  public playDefeat() {
    this.unlockAudioContext();
    this.stopAllTracks();
    this.currentTrack = 'DEFEAT';

    if (this.defeatSfx && !this.isMuted) {
      this.defeatSfx.stop();
      this.defeatSfx.volume(0.9 * this.masterVolume);
      this.defeatSfx.play();
    }
  }

  public stopCurrentMusic() {
    this.stopAllTracks();
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

  public getCurrentPlaylistIndex() {
    return this.currentMatchPlaylistIndex;
  }
}

export const soundtrackManager = new SoundtrackManager();
