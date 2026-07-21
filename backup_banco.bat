@echo off
REM ============================================================
REM  Backup do banco de producao - Convenio Quiro Ferreira
REM
REM  Basta dar duplo clique neste arquivo.
REM  O backup vai para: C:\Users\Suporte\Desktop\backups_banco
REM  Sao guardados os 10 mais recentes; os antigos sao apagados.
REM
REM  Sem acentos de proposito: o console do Windows costuma
REM  exibir caracteres errados dependendo da configuracao.
REM ============================================================

REM Roda sempre a partir da pasta deste arquivo, mesmo com duplo clique.
cd /d "%~dp0"

echo.
echo ==========================================
echo   BACKUP DO BANCO - Convenio Quiro Ferreira
echo ==========================================
echo.

REM Node e obrigatorio: e ele que le a .env e chama o pg_dump com seguranca.
where node >nul 2>nul
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado no PATH.
    echo Instale o Node.js ou abra este arquivo pelo terminal do projeto.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo ERRO: arquivo .env nao encontrado nesta pasta.
    echo Este .bat precisa ficar na raiz do projeto, junto do .env.
    echo.
    pause
    exit /b 1
)

node "scripts\backup_db.mjs"

if errorlevel 1 (
    echo.
    echo ==========================================
    echo   FALHOU - nenhum backup foi gerado
    echo ==========================================
    echo.
    echo Se o erro citar pg_dump, confirme que o PostgreSQL
    echo esta instalado em C:\Program Files\PostgreSQL
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   CONCLUIDO
echo ==========================================
echo.
echo Os arquivos .backup contem CPF, prontuarios e telefones
echo de pacientes. Nao envie por e-mail nem coloque no Drive
echo compartilhado sem necessidade.
echo.
pause
