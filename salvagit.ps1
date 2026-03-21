param(
    [string]$Message = 'Atualização automática via salvagit'
)

$ErrorActionPreference = 'Stop'

Write-Host '=== Salvando alterações no Git ==='

git status -sb
git add .

if (-not $Message -or $Message.Trim().Length -eq 0) {
    $Message = 'Atualização automática via salvagit'
}

git commit -m $Message
git push origin main

Write-Host '=== Operação concluída ==='
