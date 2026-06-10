Add-Type -AssemblyName System.Drawing

$outDir = Join-Path (Get-Location) "public"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$outPath = Join-Path $outDir "product-hunt-cover.png"

$width = 2400
$height = 1260
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

function Color([string]$hex, [int]$alpha = 255) {
  $hex = $hex.TrimStart("#")
  return [System.Drawing.Color]::FromArgb($alpha, [Convert]::ToInt32($hex.Substring(0,2),16), [Convert]::ToInt32($hex.Substring(2,2),16), [Convert]::ToInt32($hex.Substring(4,2),16))
}

function Brush([string]$hex, [int]$alpha = 255) {
  return New-Object System.Drawing.SolidBrush (Color $hex $alpha)
}

function Pen([string]$hex, [float]$size = 1, [int]$alpha = 255) {
  return New-Object System.Drawing.Pen((Color $hex $alpha), $size)
}

function Font([float]$size, [int]$style = 0) {
  return New-Object System.Drawing.Font("Segoe UI", $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function RoundedRect([System.Drawing.Graphics]$g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r, [System.Drawing.Brush]$fill, [System.Drawing.Pen]$stroke = $null) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($fill, $path)
  if ($stroke -ne $null) { $g.DrawPath($stroke, $path) }
  $path.Dispose()
}

function DrawText([string]$text, [float]$x, [float]$y, [float]$w, [float]$h, [System.Drawing.Font]$font, [System.Drawing.Brush]$brush, [int]$align = 0) {
  $format = New-Object System.Drawing.StringFormat
  $format.Trimming = [System.Drawing.StringTrimming]::Word
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  if ($align -eq 1) { $format.Alignment = [System.Drawing.StringAlignment]::Center }
  elseif ($align -eq 2) { $format.Alignment = [System.Drawing.StringAlignment]::Far }
  else { $format.Alignment = [System.Drawing.StringAlignment]::Near }
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $graphics.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose()
}

$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($width, $height)),
  (Color "#07070c"),
  (Color "#141018")
)
$graphics.FillRectangle($bg, 0, 0, $width, $height)
$bg.Dispose()

$glowBrush1 = Brush "#ef4444" 24
$glowBrush2 = Brush "#6366f1" 18
for ($i = 0; $i -lt 9; $i++) {
  $alphaRed = [Math]::Max(3, 26 - ($i * 3))
  $alphaBlue = [Math]::Max(3, 20 - ($i * 2))
  $redLayer = Brush "#ef4444" $alphaRed
  $blueLayer = Brush "#6366f1" $alphaBlue
  $graphics.FillEllipse($redLayer, 1180 - ($i * 28), -60 - ($i * 18), 1020 + ($i * 74), 760 + ($i * 58))
  $graphics.FillEllipse($blueLayer, -160 - ($i * 20), 760 - ($i * 16), 980 + ($i * 58), 520 + ($i * 42))
  $redLayer.Dispose()
  $blueLayer.Dispose()
}
$glowBrush1.Dispose()
$glowBrush2.Dispose()

$gridPen = Pen "#ffffff" 1 14
for ($x = 0; $x -lt $width; $x += 64) { $graphics.DrawLine($gridPen, $x, 0, $x, $height) }
for ($y = 0; $y -lt $height; $y += 64) { $graphics.DrawLine($gridPen, 0, $y, $width, $y) }
$gridPen.Dispose()

$white = Brush "#ffffff"
$muted = Brush "#94a3b8"
$red = Brush "#fca5a5"
$green = Brush "#86efac"
$amber = Brush "#fcd34d"

RoundedRect $graphics 96 82 260 62 18 (Brush "#ffffff" 22) (Pen "#ffffff" 1 36)
$logoFont = Font 30 1
DrawText "VentureOS" 126 96 220 40 $logoFont $white

RoundedRect $graphics 96 176 560 54 27 (Brush "#ef4444" 26) (Pen "#ef4444" 1 70)
DrawText "THE TRUST LAYER FOR AI-GENERATED APPS" 126 190 520 28 (Font 20 1) $red

DrawText "Find the bugs AI app" 96 270 1040 86 (Font 78 1) $white
DrawText "builders miss before" 96 374 1040 86 (Font 78 1) $white
DrawText "users do." 96 478 1040 86 (Font 78 1) $white
DrawText "Scan generated apps for fake auth, broken APIs, exposed secrets, missing validation, and deployment risks before you launch." 102 608 960 130 (Font 31 0) $muted

RoundedRect $graphics 96 790 320 72 22 (Brush "#ffffff") $null
DrawText "Scan My App" 132 808 250 40 (Font 28 1) (Brush "#07070c")
RoundedRect $graphics 438 790 360 72 22 (Brush "#ffffff" 14) (Pen "#ffffff" 1 40)
DrawText "See Example Report" 476 808 300 40 (Font 28 1) $white
DrawText "No repo access required | No credit card | Paste code or link" 102 900 780 40 (Font 24 0) $muted

RoundedRect $graphics 1280 122 920 910 30 (Brush "#101018" 238) (Pen "#ffffff" 1 34)
RoundedRect $graphics 1324 166 834 74 22 (Brush "#ffffff" 12) (Pen "#ffffff" 1 28)
DrawText "Sample Scan Report" 1360 186 420 34 (Font 28 1) $white
RoundedRect $graphics 1848 180 128 34 17 (Brush "#ef4444" 34) (Pen "#ef4444" 1 90)
DrawText "LIVE" 1888 185 70 24 (Font 18 1) $red

RoundedRect $graphics 1324 276 300 268 28 (Brush "#ef4444" 20) (Pen "#ef4444" 1 65)
DrawText "TRUST SCORE" 1362 314 220 26 (Font 22 1) $red
DrawText "34" 1362 345 210 122 (Font 112 1) $red
DrawText "/100" 1538 421 88 40 (Font 28 1) $muted
RoundedRect $graphics 1362 476 212 48 16 (Brush "#ef4444" 42) (Pen "#ef4444" 1 90)
DrawText "BLOCK DEPLOY" 1385 487 170 26 (Font 20 1) $red

RoundedRect $graphics 1652 276 506 268 28 (Brush "#ffffff" 10) (Pen "#ffffff" 1 28)
DrawText "Why it fails in production" 1690 314 420 32 (Font 30 1) $white
DrawText "Looks finished in the browser. Fails when real users hit auth, payments, webhooks, and persistence." 1690 366 420 95 (Font 25 0) $muted
DrawText "Linters catch syntax. VentureOS catches fake functionality." 1690 478 430 38 (Font 24 1) $green

$issues = @(
  @("CRITICAL", "Fake Supabase RLS", "Anyone can read user data"),
  @("CRITICAL", "Admin API has no role check", "Frontend state is trusted"),
  @("HIGH", "Stripe webhook not verified", "Forged payment events accepted")
)
$y = 580
foreach ($issue in $issues) {
  RoundedRect $graphics 1324 $y 834 116 22 (Brush "#ffffff" 10) (Pen "#ffffff" 1 26)
  RoundedRect $graphics 1360 ($y + 28) 122 34 17 (Brush "#ef4444" 30) (Pen "#ef4444" 1 75)
  DrawText $issue[0] 1378 ($y + 34) 90 22 (Font 16 1) $red
  DrawText $issue[1] 1510 ($y + 25) 450 32 (Font 27 1) $white
  DrawText $issue[2] 1510 ($y + 62) 520 30 (Font 23 0) $muted
  RoundedRect $graphics 1990 ($y + 34) 118 46 14 (Brush "#ffffff" 15) (Pen "#ffffff" 1 35)
  DrawText "Fix" 2032 ($y + 44) 46 24 (Font 20 1) $white
  $y += 138
}

RoundedRect $graphics 1324 1002 834 128 26 (Brush "#10b981" 16) (Pen "#10b981" 1 60)
DrawText "Actionable output" 1360 1028 280 32 (Font 28 1) $green
DrawText "Prioritized fixes, business impact, and clear launch decision before you ship." 1360 1070 710 34 (Font 24 0) $muted

$footer = Brush "#64748b"
DrawText "ventureos-intelligence-layer.vercel.app" 96 1132 900 44 (Font 30 1) $white
DrawText "Built for v0, Lovable, Cursor, Bolt, Replit, and AI-native builders." 96 1184 1040 34 (Font 24 0) $footer

$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outPath
