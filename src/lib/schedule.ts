/** scheduleDays = dias permitidos (0=dom … 6=sáb), estilo Evolua invertido dos “bloqueados”. */

export function isWithinSchedule(opts: {
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  scheduleTz?: string | null;
  scheduleDays?: number[] | null;
  now?: Date;
}): { ok: boolean; motivo: string | null } {
  const start = (opts.scheduleStart || "").trim();
  const end = (opts.scheduleEnd || "").trim();
  const days = opts.scheduleDays;
  if (!start && !end && (!days || days.length === 0)) {
    return { ok: true, motivo: null };
  }

  const tz = opts.scheduleTz || "America/Sao_Paulo";
  const now = opts.now || new Date();

  let day: number;
  let hm: string;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value || "Mon";
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    day = map[wd] ?? now.getDay();
    const hour = parts.find((p) => p.type === "hour")?.value || "00";
    const minute = parts.find((p) => p.type === "minute")?.value || "00";
    hm = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return { ok: true, motivo: null };
  }

  if (days && days.length > 0 && !days.includes(day)) {
    return { ok: false, motivo: "fora_da_janela_ou_bloqueado" };
  }

  if (start && end) {
    if (start <= end) {
      if (hm < start || hm > end) {
        return { ok: false, motivo: "fora_da_janela_ou_bloqueado" };
      }
    } else if (hm < start && hm > end) {
      // overnight window e.g. 22:00–06:00
      return { ok: false, motivo: "fora_da_janela_ou_bloqueado" };
    }
  }

  return { ok: true, motivo: null };
}
