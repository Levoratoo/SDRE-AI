import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getTutorial, tutorialHasVideo } from "@/lib/tutorials";

export default async function TutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireSession();
  const { p } = await searchParams;
  const tutorial = getTutorial(p);
  const hasVideo = tutorialHasVideo(tutorial);

  // Preferência: MP4 próprio (sem links/marca de terceiros na tela).
  const localSrc = tutorial.videoSrc;
  const youtubeEmbed =
    !localSrc && tutorial.youtubeId
      ? `https://www.youtube.com/embed/${tutorial.youtubeId}?autoplay=1&rel=0&modestbranding=1&controls=1`
      : null;

  return (
    <div className="tut-page">
      <div className="tut-topbar">
        <h1 className="tut-title">
          <span className="tut-title-pre">Tutorial —</span>
          <span className="tut-title-name">{tutorial.title}</span>
        </h1>
        <Link className="tut-btn-back" href={tutorial.backHref}>
          ✕ Fechar
        </Link>
      </div>

      {localSrc ? (
        <div className="tut-wrap">
          <div className="tut-player">
            <video
              src={localSrc}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              title={`Tutorial — ${tutorial.title}`}
            />
          </div>
        </div>
      ) : youtubeEmbed ? (
        <div className="tut-wrap">
          <div className="tut-player">
            <iframe
              src={youtubeEmbed}
              title={`Tutorial — ${tutorial.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      ) : (
        <div className="tut-empty">
          <div className="tut-empty-icon">▶</div>
          <h2>Tutorial em produção</h2>
          <p>
            Estamos gravando os vídeos oficiais do Levorato Prospect — sem marca
            ou links de terceiros na tela. Em breve esta página terá o passo a
            passo completo de {tutorial.title}.
          </p>
          <Link href={tutorial.backHref}>Voltar ao painel</Link>
        </div>
      )}

      {!hasVideo ? null : null}
    </div>
  );
}
