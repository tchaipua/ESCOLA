# UI_PATTERN_GRID_COLUMNS_PORTABLE

## Objetivo

Documentar o pacote minimo para reaproveitar, em outro sistema, apenas o padrao de configuracao de colunas das grids.

Este arquivo trata somente do botao `Colunas` e do modal onde o usuario pode:

- exibir ou ocultar colunas;
- mudar a ordem das colunas;
- restaurar a configuracao padrao;
- manter a configuracao memorizada por usuario/tela.

Nao inclui exportacao, impressao, filtro de status, ordenacao do cabecalho ou regras visuais completas da listagem.

## Padrao de referencia

Padrao oficial relacionado:

- `DOCUMENTACAO/AI/UI_PATTERNS.md#pat-002---configuracao-de-colunas-do-grid`

Componente principal:

- `frontend/src/app/components/grid-column-config-modal.tsx`

Utilitario principal:

- `frontend/src/app/lib/grid-column-config-utils.ts`

## Arquivos minimos para copiar

Para levar este padrao para outro sistema React/Next, copiar:

```text
frontend/src/app/components/grid-column-config-modal.tsx
frontend/src/app/lib/grid-column-config-utils.ts
```

Se o outro sistema nao tiver os mesmos caminhos de alias (`@/app/...`), ajustar os imports.

## Dependencias internas que precisam ser adaptadas

O componente atual usa alguns pontos especificos do sistema Escola:

```text
@/app/lib/auth-storage
@/app/lib/tenant-branding-cache
@/app/lib/user-preferences
@/app/lib/grid-export-utils
```

Ao portar para outro sistema:

- `auth-storage`: pode ser removido se o novo sistema nao usar token para descobrir empresa/escola.
- `tenant-branding-cache`: pode ser substituido por props simples como `logoUrl` e `tenantName`.
- `user-preferences`: deve ser adaptado para a API do novo sistema ou substituido por `localStorage`.
- `grid-export-utils`: se o destino for usar apenas colunas, mover o tipo `GridColumnDefinition` para o proprio arquivo de colunas ou criar um tipo local equivalente.

## Contrato minimo de coluna

Cada tela deve ter uma definicao unica de colunas.

Exemplo:

```ts
type ColumnKey = 'name' | 'email' | 'status';

type Row = {
    name: string;
    email: string;
    status: string;
};

const GRID_COLUMNS = [
    {
        key: 'name',
        label: 'Nome',
        visibleByDefault: true,
        getValue: (row: Row) => row.name,
    },
    {
        key: 'email',
        label: 'Email',
        visibleByDefault: true,
        getValue: (row: Row) => row.email,
    },
    {
        key: 'status',
        label: 'Status',
        visibleByDefault: false,
        getValue: (row: Row) => row.status,
    },
] satisfies Array<{
    key: ColumnKey;
    label: string;
    visibleByDefault?: boolean;
    getValue: (row: Row) => string;
}>;
```

Regra obrigatoria:

- a tela nao deve manter uma lista separada para o grid e outra para o modal de colunas;
- a definicao `GRID_COLUMNS` deve ser a fonte oficial.

## Estado necessario na tela

A tela que usa o modal precisa controlar:

```ts
const allColumnKeys = getAllGridColumnKeys(GRID_COLUMNS);
const defaultVisibleColumnKeys = getDefaultVisibleGridColumnKeys(GRID_COLUMNS);

const [isGridConfigOpen, setIsGridConfigOpen] = useState(false);
const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(defaultVisibleColumnKeys);
const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>(
    allColumnKeys.filter((key) => !defaultVisibleColumnKeys.includes(key)),
);
```

Ao carregar a tela:

```ts
useEffect(() => {
    void loadGridColumnConfig(storageKey, allColumnKeys, defaultVisibleColumnKeys).then((config) => {
        setColumnOrder(config.order);
        setHiddenColumns(config.hidden);
    });
}, [storageKey]);
```

Ao alterar configuracao:

```ts
useEffect(() => {
    writeGridColumnConfig(storageKey, allColumnKeys, columnOrder, hiddenColumns);
}, [storageKey, columnOrder, hiddenColumns]);
```

## Colunas visiveis no grid

A renderizacao da tabela deve usar somente as colunas visiveis:

```ts
const orderedColumns = useMemo(
    () => columnOrder
        .map((key) => GRID_COLUMNS.find((column) => column.key === key))
        .filter((column): column is typeof GRID_COLUMNS[number] => Boolean(column)),
    [columnOrder],
);

const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !hiddenColumns.includes(column.key)),
    [orderedColumns, hiddenColumns],
);
```

No cabecalho e nas linhas:

```tsx
<thead>
    <tr>
        {visibleColumns.map((column) => (
            <th key={column.key}>{column.label}</th>
        ))}
    </tr>
</thead>

<tbody>
    {rows.map((row) => (
        <tr key={row.id}>
            {visibleColumns.map((column) => (
                <td key={column.key}>{column.getValue(row)}</td>
            ))}
        </tr>
    ))}
</tbody>
```

## Acoes obrigatorias

Alternar visibilidade:

```ts
function toggleColumnVisibility(columnKey: ColumnKey) {
    const isHidden = hiddenColumns.includes(columnKey);
    const visibleCount = allColumnKeys.length - hiddenColumns.length;

    if (!isHidden && visibleCount <= 1) return;

    setHiddenColumns((current) =>
        isHidden
            ? current.filter((item) => item !== columnKey)
            : [...current, columnKey],
    );
}
```

Mover coluna:

```ts
function moveColumn(columnKey: ColumnKey, direction: 'up' | 'down') {
    setColumnOrder((current) => {
        const currentIndex = current.indexOf(columnKey);
        if (currentIndex === -1) return current;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= current.length) return current;

        const next = [...current];
        [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
        return next;
    });
}
```

Restaurar padrao:

```ts
function resetGridColumns() {
    setColumnOrder(defaultVisibleColumnKeys);
    setHiddenColumns(allColumnKeys.filter((key) => !defaultVisibleColumnKeys.includes(key)));
}
```

## Uso do modal

```tsx
<GridColumnConfigModal
    isOpen={isGridConfigOpen}
    title="Configurar colunas do grid"
    description="Reordene, oculte ou inclua colunas desta tela."
    columns={orderedColumns.map((column) => ({
        key: column.key,
        label: column.label,
        visibleByDefault: column.visibleByDefault,
    }))}
    orderedColumns={columnOrder}
    hiddenColumns={hiddenColumns}
    onToggleColumnVisibility={toggleColumnVisibility}
    onMoveColumn={moveColumn}
    onReset={resetGridColumns}
    onClose={() => setIsGridConfigOpen(false)}
/>
```

## Chave de persistencia

A chave precisa separar usuario, tenant/empresa e tela.

Formato recomendado:

```ts
const storageKey = `grid-columns:${tenantId}:${userId}:NOME_TECNICO_DA_TELA`;
```

Se nao houver backend de preferencias, usar `localStorage`.

Se houver backend, salvar no equivalente a `user-preferences`, sempre respeitando o tenant da sessao.

## Regras de seguranca e negocio

- A configuracao de colunas e uma preferencia visual do usuario.
- Nao deve alterar dados de negocio.
- Nao deve fazer delete fisico.
- Nao deve permitir vazamento entre tenants/escolas/empresas.
- A chave de persistencia deve conter o escopo da empresa/escola quando o sistema for multi-tenant.
- Novas colunas adicionadas na definicao oficial devem aparecer automaticamente como disponiveis no modal.

## Checklist para portar

- [ ] Copiar `grid-column-config-modal.tsx`.
- [ ] Copiar `grid-column-config-utils.ts`.
- [ ] Ajustar imports de alias.
- [ ] Remover ou adaptar branding da escola.
- [ ] Remover ou adaptar token/auth.
- [ ] Adaptar `fetchUserPreference` e `saveUserPreference`.
- [ ] Criar definicao unica de colunas na tela destino.
- [ ] Usar `visibleColumns` para renderizar cabecalho e linhas.
- [ ] Criar chave de persistencia por usuario, tenant e tela.
- [ ] Validar que ao menos uma coluna continua visivel.

## Contexto assumido

O sistema destino usa React ou Next.js e possui uma tela com grid/tabular.

## Regra de negocio aplicada

Configuracao de colunas e preferencia visual por usuario/tela, preservando isolamento por tenant quando existir multi-tenant.

## Arquivos afetados neste projeto

- `DOCUMENTACAO/AI/UI_PATTERN_GRID_COLUMNS_PORTABLE.md`

## Riscos e pontos pendentes

- Se o sistema destino nao usar React, o comportamento deve ser reimplementado mantendo o contrato funcional.
- Se nao houver backend de preferencias, a memoria ficara limitada ao navegador via `localStorage`.
- Se a chave de persistencia nao incluir tenant/empresa, pode haver mistura indevida de preferencias entre contextos.
