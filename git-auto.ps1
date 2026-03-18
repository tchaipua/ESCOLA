param(
    [string]$Message
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git não está disponível neste terminal."
    exit 1
}

$messageTrimmed = $Message
if (-not $messageTrimmed) {
    $messageTrimmed = Read-Host "Mensagem do commit"
}

if (-not $messageTrimmed) {
    Write-Warning "Nenhuma mensagem informada; o commit foi cancelado."
    exit 1
}

git status -sb

Write-Host "Adicionando alterações..." -ForegroundColor Cyan
git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Não há alterações para commitar." -ForegroundColor Yellow
    exit 0
}

Write-Host "Fazendo commit com a mensagem '$messageTrimmed'..." -ForegroundColor Cyan
git commit -m $messageTrimmed
if ($LASTEXITCODE -ne 0) {
    Write-Error "O commit falhou. Verifique o log para mais detalhes."
    exit $LASTEXITCODE
}

$branch = git rev-parse --abbrev-ref HEAD
Write-Host "Enviando para origin/$branch..." -ForegroundColor Cyan
git push origin $branch
if ($LASTEXITCODE -ne 0) {
    Write-Error "Push falhou. Resolva o problema (ex.: autenticação) e execute novamente."
    exit $LASTEXITCODE
}

Write-Host "Ciclo concluído!" -ForegroundColor Green
