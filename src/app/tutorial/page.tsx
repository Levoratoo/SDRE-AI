import Link from "next/link";
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
  const embed =
    tutorial.youtubeId != null
      ? `https://www.youtube.com/embed/${tutorial.youtubeId}?autoplay=1&rel=0&modestbranding=1`
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

      {embed ? (
        <div className="tut-wrap">
          <div className="tut-player">
            <iframe
              src={embed}
              title={`Tutorial — ${tutorial.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      ) : (
        <div className="tut-empty">
          <div className="tut-empty-icon">▶</div>
          <h2>Tutorial em breve</h2>
          <p>
            Ainda não temos o vídeo desta página. Volte ao painel e continue
            usando o produto normalmente.
          </p>
          <Link href={tutorial.backHref}>Voltar</Link>
        </div>
      )}
    </div>
  );
}
