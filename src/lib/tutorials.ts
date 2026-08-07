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
  youtubeId: string | null;
  /** MP4 em /public/tutorials/... (tem prioridade sobre YouTube). */
  videoSrc: string | null;
  backHref: string;
};

const TUTORIALS: Record<TutorialKey, Tutorial> = {
  dashboard: {
    key: "dashboard",
    title: "Início",
    youtubeId: "rKbQUxP6tSo",
    videoSrc: null,
    backHref: "/dashboard",
  },
  extracoes: {
    key: "extracoes",
    title: "Extrações",
    youtubeId: "jymCuJzcWo4",
    videoSrc: null,
    backHref: "/extracoes",
  },
  leads: {
    key: "leads",
    title: "Base de leads",
    youtubeId: "jymCuJzcWo4",
    videoSrc: null,
    backHref: "/leads",
  },
  mensagens_dm: {
    key: "mensagens_dm",
    title: "Mensagens DM",
    youtubeId: "fxXT7nn3ilE",
    videoSrc: null,
    backHref: "/mensagens",
  },
  comentarios: {
    key: "comentarios",
    title: "Comentários",
    youtubeId: "fxXT7nn3ilE",
    videoSrc: null,
    backHref: "/comentarios",
  },
  stories: {
    key: "stories",
    title: "Stories",
    youtubeId: "fxXT7nn3ilE",
    videoSrc: null,
    backHref: "/stories",
  },
  campanhas: {
    key: "campanhas",
    title: "Campanhas",
    youtubeId: "OgNMVF4Byg8",
    videoSrc: null,
    backHref: "/campanhas",
  },
  agente: {
    key: "agente",
    title: "Agente IA",
    youtubeId: "5Tn0DNt1On8",
    videoSrc: null,
    backHref: "/agente",
  },
  extensao: {
    key: "extensao",
    title: "Extensão",
    youtubeId: "jymCuJzcWo4",
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
