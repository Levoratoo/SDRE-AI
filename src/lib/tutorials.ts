export type TutorialKey =
  | "dashboard"
  | "extracoes"
  | "leads"
  | "mensagens_dm"
  | "comentarios"
  | "stories"
  | "campanhas"
  | "agente"
  | "extensao"
  | "minha_conta";

export type Tutorial = {
  key: TutorialKey;
  title: string;
  /** YouTube ID só de vídeos Levorato (sem marca de terceiros). */
  youtubeId: string | null;
  /** MP4 hospedado em /public/tutorials/... (preferível — sem links externos). */
  videoSrc: string | null;
  backHref: string;
};

/**
 * Tutoriais oficiais Levorato Prospect.
 * Não usar vídeos de terceiros (aparecem nome/marca/links na tela).
 * Para ativar: coloque o MP4 em public/tutorials/ e preencha videoSrc,
 * ou um YouTube ID do canal Levorato em youtubeId.
 */
const TUTORIALS: Record<TutorialKey, Tutorial> = {
  dashboard: {
    key: "dashboard",
    title: "Início",
    youtubeId: null,
    videoSrc: null,
    backHref: "/dashboard",
  },
  extracoes: {
    key: "extracoes",
    title: "Extrações",
    youtubeId: null,
    videoSrc: null,
    backHref: "/extracoes",
  },
  leads: {
    key: "leads",
    title: "Base de leads",
    youtubeId: null,
    videoSrc: null,
    backHref: "/leads",
  },
  mensagens_dm: {
    key: "mensagens_dm",
    title: "Mensagens DM",
    youtubeId: null,
    videoSrc: null,
    backHref: "/mensagens",
  },
  comentarios: {
    key: "comentarios",
    title: "Comentários",
    youtubeId: null,
    videoSrc: null,
    backHref: "/comentarios",
  },
  stories: {
    key: "stories",
    title: "Stories",
    youtubeId: null,
    videoSrc: null,
    backHref: "/stories",
  },
  campanhas: {
    key: "campanhas",
    title: "Campanhas",
    youtubeId: null,
    videoSrc: null,
    backHref: "/campanhas",
  },
  agente: {
    key: "agente",
    title: "Agente IA",
    youtubeId: null,
    videoSrc: null,
    backHref: "/agente",
  },
  extensao: {
    key: "extensao",
    title: "Extensão",
    youtubeId: null,
    videoSrc: null,
    backHref: "/extensao",
  },
  minha_conta: {
    key: "minha_conta",
    title: "Minha Conta",
    youtubeId: null,
    videoSrc: null,
    backHref: "/conta",
  },
};

const PATH_TO_KEY: Record<string, TutorialKey> = {
  "/dashboard": "dashboard",
  "/extracoes": "extracoes",
  "/leads": "leads",
  "/mensagens": "mensagens_dm",
  "/comentarios": "comentarios",
  "/stories": "stories",
  "/campanhas": "campanhas",
  "/agente": "agente",
  "/extensao": "extensao",
  "/conta": "minha_conta",
};

export function getTutorial(key: string | null | undefined): Tutorial {
  if (key && key in TUTORIALS) {
    return TUTORIALS[key as TutorialKey];
  }
  return TUTORIALS.dashboard;
}

export function tutorialHasVideo(t: Tutorial) {
  return Boolean(t.videoSrc || t.youtubeId);
}

export function tutorialKeyFromPath(pathname: string): TutorialKey {
  const base = pathname.split("?")[0]?.replace(/\/$/, "") || "/dashboard";
  return PATH_TO_KEY[base] ?? "dashboard";
}

export function tutorialHrefForPath(pathname: string): string {
  const key = tutorialKeyFromPath(pathname);
  return `/tutorial?p=${key}`;
}
