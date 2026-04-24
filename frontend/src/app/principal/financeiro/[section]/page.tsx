import { notFound, redirect } from 'next/navigation';
import FinancialEmbeddedScreen from '../_components/financial-embedded-screen';

const SECTION_CONFIG = {
  resumo: {
    title: 'Resumo Geral',
    iframePath: '/resumo',
  },
  empresa: {
    title: 'Empresa',
    iframePath: '/empresas',
  },
  bancos: {
    title: 'Controle de Bancos',
    iframePath: '/bancos',
  },
  lotes: {
    title: 'Lotes',
    iframePath: '/recebiveis/lotes',
  },
  retornos: {
    title: 'Retornos',
    iframePath: '/recebiveis/retornos',
  },
  caixa: {
    title: 'Caixa',
    iframePath: '/caixa',
  },
} as const;

type SectionKey = keyof typeof SECTION_CONFIG;

export default async function PrincipalFinanceiroSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (section === 'parcelas') {
    redirect('/principal/parcelas');
  }

  if (!(section in SECTION_CONFIG)) {
    notFound();
  }

  const config = SECTION_CONFIG[section as SectionKey];

  return <FinancialEmbeddedScreen title={config.title} iframePath={config.iframePath} />;
}
