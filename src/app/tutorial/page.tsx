import Link from "next/link";
import {
  TutorialLocalPlayer,
  TutorialYoutubePlayer,
} from "@/components/tutorial-player";
import { requireSession } from "@/lib/session";
import { getTutorial } from "@/lib/tutorials";

export default async function TutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireSession();
  const { p } = await searchParams;
  const tutorial = getTutorial(p);

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

      {tutorial.videoSrc ? (
        <TutorialLocalPlayer
          src={tutorial.videoSrc}
          title={`Tutorial — ${tutorial.title}`}
        />
      ) : tutorial.youtubeId ? (
        <TutorialYoutubePlayer
          videoId={tutorial.youtubeId}
          title={`Tutorial — ${tutorial.title}`}
        />
      ) : (
        <div className="tut-empty">
          <div className="tut-empty-icon">▶</div>
          <h2>Tutorial em breve</h2>
          <p>
            Ainda não há vídeo para {tutorial.title}. Volte ao painel e continue
            pela interface.
          </p>
          <Link href={tutorial.backHref}>Voltar ao painel</Link>
        </div>
      )}
    </div>
  );
}
