"use client";

import { useEffect, useId, useRef, useState } from "react";

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<void> | null = null;

function loadYtApi() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    if (window.YT?.Player) resolve();
  });
  return ytApiPromise;
}

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TutorialYoutubePlayer({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const hostId = useId().replace(/:/g, "");
  const playerRef = useRef<YtPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const seekingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let tick: ReturnType<typeof setInterval> | null = null;

    loadYtApi().then(() => {
      if (cancelled || !window.YT?.Player) return;
      const el = document.getElementById(hostId);
      if (!el) return;

      playerRef.current = new window.YT.Player(hostId, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          disablekb: 1,
          playsinline: 1,
          cc_load_policy: 0,
          showinfo: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            setReady(true);
            setDuration(e.target.getDuration() || 0);
            try {
              e.target.playVideo();
            } catch {
              /* autoplay pode bloquear */
            }
            tick = setInterval(() => {
              if (!playerRef.current || seekingRef.current) return;
              try {
                setCurrent(playerRef.current.getCurrentTime() || 0);
                setDuration(playerRef.current.getDuration() || 0);
                const st = playerRef.current.getPlayerState();
                setPlaying(st === window.YT!.PlayerState.PLAYING);
              } catch {
                /* player destruído */
              }
            }, 400);
          },
          onStateChange: (e) => {
            if (!window.YT) return;
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (tick) clearInterval(tick);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [hostId, videoId]);

  function toggle() {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  function onSeek(value: number) {
    const p = playerRef.current;
    if (!p || !ready) return;
    seekingRef.current = true;
    setCurrent(value);
    p.seekTo(value, true);
    seekingRef.current = false;
  }

  return (
    <div className="tut-wrap">
      <div className="tut-player tut-player-clean">
        <div className="tut-yt-shell">
          <div id={hostId} className="tut-yt-host" />
          {/* Bloqueia título / canal / links do YouTube */}
          <div className="tut-yt-mask tut-yt-mask-top" aria-hidden />
          <div className="tut-yt-mask tut-yt-mask-logo" aria-hidden />
          <button
            type="button"
            className="tut-yt-hit"
            onClick={toggle}
            aria-label={playing ? "Pausar" : "Reproduzir"}
            title={title}
          />
        </div>
        <div className="tut-controls">
          <button
            type="button"
            className="tut-ctrl-btn"
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Pausar" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range"
            className="tut-seek"
            min={0}
            max={Math.max(1, duration)}
            step={0.1}
            value={Math.min(current, duration || 0)}
            disabled={!ready}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Posição do vídeo"
          />
          <span className="tut-time mono">
            {fmt(current)} / {fmt(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TutorialLocalPlayer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  return (
    <div className="tut-wrap">
      <div className="tut-player tut-player-clean">
        <video
          src={src}
          controls
          autoPlay
          playsInline
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          title={title}
        />
      </div>
    </div>
  );
}
