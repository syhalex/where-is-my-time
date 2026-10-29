$ErrorActionPreference = 'Stop'
$exePath = Join-Path $PSScriptRoot 'WhereIsMyTime.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw '请先运行 build.ps1' }
$desktopRoot = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopRoot 'WhereIsMyTime.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $exePath) { throw '桌面已存在其他同名快捷方式，请先重命名' }
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$shortcut.IconLocation = (Join-Path $PSScriptRoot 'where-is-my-time.ico') + ',0'
$shortcut.Description = '打开WhereIsMyTime'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Output $shortcutPath
