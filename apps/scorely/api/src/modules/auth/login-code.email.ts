import type { Locale } from '@scorely/contracts';

type Template = (code: string, minutes: number) => { subject: string; text: string };

/** Assunto e texto do email com o código de login, por idioma (o usuário pode ainda não existir). */
const TEMPLATES: Record<Locale, Template> = {
  'pt-BR': (code, minutes) => ({
    subject: `${code} é o seu código do scorely`,
    text: `Seu código de acesso é ${code}.\n\nEle vale por ${minutes} minutos. Se não foi você, ignore este email.`,
  }),
  en: (code, minutes) => ({
    subject: `${code} is your scorely code`,
    text: `Your access code is ${code}.\n\nIt is valid for ${minutes} minutes. If this wasn't you, ignore this email.`,
  }),
};

/** Sem idioma na requisição → `pt-BR` (plano 005, pergunta 2). */
export function loginCodeEmail(code: string, minutes: number, locale: Locale = 'pt-BR') {
  return TEMPLATES[locale](code, minutes);
}
