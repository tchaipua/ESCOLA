export type UiPatternId =
    | 'program-header-school-finance'
    | 'grid-list-toolbar-school-finance'
    | 'grid-admin'
    | 'grid-column-config'
    | 'grid-export'
    | 'grid-export-pdf'
    | 'grid-export-excel'
    | 'record-details-popup'
    | 'institutional-popup-identity'
    | 'tabbed-form-fixed-footer'
    | 'special-access-flow'
    | 'global-settings-tabs';

export type UiPatternDefinition = {
    id: UiPatternId;
    name: string;
    summary: string;
    documentationPath: string;
    componentPaths: string[];
    referenceScreens: string[];
    status: 'approved' | 'evolving';
};

export const UI_PATTERNS: UiPatternDefinition[] = [
    {
        id: 'program-header-school-finance',
        name: 'CABECALHO PADRAO DE PROGRAMAS ESCOLA/FINANCEIRO',
        summary: 'FAIXA AZUL COM BOTOES LATERAIS, LOGOTIPO DA ESCOLA, TITULO, DESCRICAO, CARD BRANCO DO USUARIO E BOTAO VOLTAR DENTRO DO BLOCO, SEM STICKY E COM `PRINCIPAL_PROFESSORES` COMO REFERENCIA VISUAL SOBERANA DO LADO DIREITO.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-014---cabecalho-padrao-de-programas-escola-e-financeiro',
        componentPaths: [
            'frontend/src/app/components/principal-program-header.tsx',
            'frontend/src/app/principal/layout.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/page.tsx',
            'frontend/src/app/principal/notificacoes/page.tsx',
            'frontend/src/app/principal/pessoas/page.tsx',
            'frontend/src/app/principal/financeiro/[section]/page.tsx',
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/mensalidades/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-list-toolbar-school-finance',
        name: 'TOOLBAR PADRAO DE GRID ESCOLA/FINANCEIRO',
        summary: 'BARRA OPERACIONAL DE LISTAGEM COM ACAO DE INCLUIR NO INICIO DA LINHA DA BUSCA QUANDO EXISTIR, BOTAO COLUNAS E BOTAO DE EXPORTACAO/IMPRESSAO A ESQUERDA, CONTROLES/TIPO SEMAFORO NO CENTRO E CONTADOR DE REGISTROS A DIREITA, SEM FAIXA EXPLICATIVA NEM FAIXA AZUL INTERNA DUPLICANDO TITULO/DESCRICAO, USADA SOMENTE EM TELAS COM GRID.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-015---toolbar-padrao-de-grid-escola-e-financeiro',
        componentPaths: [
            'frontend/src/app/components/grid-footer-controls.tsx',
            'frontend/src/app/components/grid-column-config-modal.tsx',
            'frontend/src/app/components/grid-export-modal.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/alunos/page.tsx',
            'frontend/src/app/principal/responsaveis/page.tsx',
            'frontend/src/app/principal/financeiro/[section]/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-admin',
        name: 'GRID ADMINISTRATIVO PADRAO',
        summary: 'GRID COM EXPORTACAO, ORDENACAO, CONFIGURACAO DE COLUNAS E FONTE UNICA DE CAMPOS PARA GRID E EXPORT.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-001---grid-administrativo-padrao',
        componentPaths: [
            'frontend/src/app/components/grid-sortable-header.tsx',
            'frontend/src/app/components/grid-footer-controls.tsx',
            'frontend/src/app/components/grid-status-filter.tsx',
            'frontend/src/app/components/record-status-indicator.tsx',
            'frontend/src/app/lib/grid-export-utils.ts',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/alunos/page.tsx',
            'frontend/src/app/principal/responsaveis/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-column-config',
        name: 'CONFIGURACAO DE COLUNAS',
        summary: 'MODAL FIXO NO TOPO, ORDENACAO POR ARRASTE E CONTROLE VISUAL VERDE/VERMELHO.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-002---configuracao-de-colunas-do-grid',
        componentPaths: [
            'frontend/src/app/components/grid-column-config-modal.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/alunos/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-export',
        name: 'EXPORTACAO PADRAO DE GRID',
        summary: 'MODAL FIXO COM CAMPOS ATIVOS PRIMEIRO, CONTROLES REDONDOS, MEMORIA POR USUARIO E DISPONIBILIDADE AUTOMATICA DE CAMPOS NOVOS.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-003---exportacao-padrao-de-grid',
        componentPaths: [
            'frontend/src/app/components/grid-export-modal.tsx',
            'frontend/src/app/lib/grid-export-utils.ts',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/alunos/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-export-pdf',
        name: 'EXPORTACAO PDF INSTITUCIONAL',
        summary: 'PDF COM CABECALHO DA ESCOLA, TOTAL FINAL E ETAPA PROPRIA DE LAYOUT.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-004---exportacao-pdf-institucional',
        componentPaths: [
            'frontend/src/app/lib/grid-export-utils.ts',
            'frontend/src/app/components/grid-export-modal.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/grade-horaria/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'grid-export-excel',
        name: 'EXPORTACAO EXCEL INSTITUCIONAL',
        summary: 'XLSX REAL COM TOPO CONGELADO, LOGO DA ESCOLA E COLUNAS AJUSTADAS PELO CONTEUDO.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-005---exportacao-excel-institucional',
        componentPaths: [
            'frontend/src/app/lib/grid-export-utils.ts',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
            'frontend/src/app/principal/alunos/page.tsx',
            'frontend/src/app/msinfor-admin/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'record-details-popup',
        name: 'DETALHES DO REGISTRO',
        summary: 'POPUP CENTRAL COM LOGO/FOTO, LEITURA MAIS ABERTA E MENOS ROLAGEM.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-006---detalhes-do-registro-via-popup',
        componentPaths: [
            'frontend/src/app/components/grid-record-popover.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/alunos/page.tsx',
            'frontend/src/app/msinfor-admin/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'institutional-popup-identity',
        name: 'POPUP INSTITUCIONAL COM IDENTIFICADOR',
        summary: 'POPUP/MODAL COM LOGO NO CABECALHO, NOME TECNICO EXCLUSIVO E BLOCO "TELA:" ISOLADO EM LINHA PROPRIA NO RODAPE COM BOTAO DE COPIA E ABERTURA DA AUDITORIA SQL. O MODAL DE AUDITORIA USA ABAS NO CABECALHO, BOTOES FECHAR/COPIAR SQL A DIREITA E COPIAR SQL SOMENTE NA ABA SQL. TODA TELA NOVA DEVE TER UM UNICO NOME TECNICO VISIVEL E EXCLUSIVO.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-013---popup-institucional-com-logo-da-escola-e-identificador-exclusivo',
        componentPaths: [
            'frontend/src/app/components/screen-name-copy.tsx',
            'frontend/src/app/components/audited-popup-shell.tsx',
            'frontend/src/app/components/screen-audit-modal.tsx',
            'frontend/src/app/lib/tenant-branding-cache.ts',
        ],
        referenceScreens: [
            'frontend/src/app/principal/mensalidades/page.tsx',
            'frontend/src/app/components/status-confirmation-modal.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'tabbed-form-fixed-footer',
        name: 'CADASTRO EM ABAS COM RODAPE FIXO',
        summary: 'FORMULARIO COM ABAS, CONTEUDO ROLAVEL E ACOES FIXAS.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-007---cadastro-em-abas-com-rodape-fixo',
        componentPaths: [
            'frontend/src/app/principal/professores/page.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/principal/professores/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'special-access-flow',
        name: 'ACESSOS ESPECIAIS',
        summary: 'FLUXO ADMINISTRATIVO FOCADO PARA PERFIS DA ESCOLA E COMPLEMENTARES.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-008---acessos-especiais-da-escola',
        componentPaths: [
            'frontend/src/app/msinfor-admin/components/tenant-access-manager.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/msinfor-admin/page.tsx',
        ],
        status: 'approved',
    },
    {
        id: 'global-settings-tabs',
        name: 'CONFIGURACOES GLOBAIS',
        summary: 'MODULO GLOBAL DA SOFTHOUSE ORGANIZADO EM ABAS E CAMPOS SENSIVEIS PRESERVADOS.',
        documentationPath: 'DOCUMENTACAO/AI/UI_PATTERNS.md#pat-009---configuracoes-globais-da-softhouse',
        componentPaths: [
            'frontend/src/app/msinfor-admin/components/global-settings-modal.tsx',
        ],
        referenceScreens: [
            'frontend/src/app/msinfor-admin/page.tsx',
        ],
        status: 'approved',
    },
];

export function getUiPatternById(patternId: UiPatternId) {
    return UI_PATTERNS.find((pattern) => pattern.id === patternId) ?? null;
}
