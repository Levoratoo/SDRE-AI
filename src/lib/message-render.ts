export function primeiroNome(fullName: string | null | undefined, username: string) {
  const base = (fullName || "").trim();
  if (!base) return username;
  return base.split(/\s+/)[0] || username;
}

export function renderTemplate(
  texto: string,
  lead: { username: string; fullName?: string | null },
) {
  const username = lead.username.replace(/^@/, "");
  const nome = (lead.fullName || "").trim() || username;
  const primeiro = primeiroNome(lead.fullName, username);
  return texto
    .replaceAll("{primeiro_nome}", primeiro)
    .replaceAll("{nome}", nome)
    .replaceAll("{username}", username);
}
