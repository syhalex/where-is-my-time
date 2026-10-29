$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$launcherRoot = $PSScriptRoot
$iconPath = Join-Path $launcherRoot 'where-is-my-time.ico'
$exePath = Join-Path $launcherRoot 'WhereIsMyTime.exe'
$iconFrames = [System.Collections.Generic.List[object]]::new()
function Fill-RoundedRectangle($graphics, $brush, [single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
    $shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $radius * 2
    $shape.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $shape.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $shape.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $shape.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $shape.CloseFigure()
    $graphics.FillPath($brush, $shape)
    $shape.Dispose()
}
foreach ($iconSize in @(16, 32, 48, 256)) {
    $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($iconSize / 64.0, $iconSize / 64.0)
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#31594B'))
    $foreground = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E6EFCF'))
    $subtle = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(115, 230, 239, 207))
    Fill-RoundedRectangle $graphics $background 0 0 64 64 18
    Fill-RoundedRectangle $graphics $foreground 16 16 13 13 4
    Fill-RoundedRectangle $graphics $foreground 35 16 13 13 4
    Fill-RoundedRectangle $graphics $foreground 16 35 13 13 4
    Fill-RoundedRectangle $graphics $subtle 35 35 13 13 4
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $iconFrames.Add([PSCustomObject]@{Size=$iconSize; Data=$stream.ToArray()})
    $stream.Dispose(); $background.Dispose(); $foreground.Dispose(); $subtle.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$file = [System.IO.File]::Create($iconPath)
$writer = [System.IO.BinaryWriter]::new($file)
try {
    $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$iconFrames.Count)
    $offset = 6 + 16 * $iconFrames.Count
    foreach ($frame in $iconFrames) {
        $dimension = if ($frame.Size -eq 256) {[byte]0} else {[byte]$frame.Size}
        $writer.Write($dimension); $writer.Write($dimension); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([UInt16]1); $writer.Write([UInt16]32); $writer.Write([UInt32]$frame.Data.Length); $writer.Write([UInt32]$offset)
        $offset += $frame.Data.Length
    }
    foreach ($frame in $iconFrames) { $writer.Write([byte[]]$frame.Data) }
} finally { $writer.Dispose(); $file.Dispose() }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /optimize+ /codepage:65001 /reference:System.Windows.Forms.dll "/win32icon:$iconPath" "/out:$exePath" (Join-Path $launcherRoot 'WhereIsMyTimeLauncher.cs')
if ($LASTEXITCODE -ne 0) { throw '启动器编译失败' }
Write-Output $exePath
