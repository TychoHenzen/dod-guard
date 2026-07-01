import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

/**
 * Play a short, distinctive multi-tone jingle to draw the user's attention to a
 * pending manual verification. Windows-only; fire-and-forget and never throws.
 *
 * Uses an ascending arpeggio via PowerShell's [console]::beep so it is clearly
 * distinct from the single standard system bell / notification chime.
 */
export function playJingle(): void {
  if (!isWindows) return;
  const tune = [
    "[console]::beep(659,140)", // E5
    "[console]::beep(988,140)", // B5
    "[console]::beep(1319,180)", // E6
    "[console]::beep(988,90)", // B5
    "[console]::beep(1319,260)", // E6 (hold)
  ].join(";");
  try {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", tune], {
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Audio is best-effort; never block verification on it.
  }
}

export interface VerifyDialogResult {
  result: "yes" | "no";
  note?: string;
}

// A WinForms dialog (instead of WScript.Shell.Popup) so the human can attach a
// free-text note alongside the pass/fail verdict. Built inline via
// Add-Type — no compiled assembly, no extra files to ship.
const VERIFY_DIALOG_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = $env:DODG_TITLE
$form.Width = 520
$form.Height = 420
$form.StartPosition = "CenterScreen"
$form.Topmost = $true
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$msgBox = New-Object System.Windows.Forms.TextBox
$msgBox.Multiline = $true
$msgBox.ReadOnly = $true
$msgBox.ScrollBars = "Vertical"
$msgBox.Text = $env:DODG_MSG
$msgBox.Location = New-Object System.Drawing.Point(10,10)
$msgBox.Size = New-Object System.Drawing.Size(484,220)
$form.Controls.Add($msgBox)

$noteLabel = New-Object System.Windows.Forms.Label
$noteLabel.Text = "Notes (optional):"
$noteLabel.Location = New-Object System.Drawing.Point(10,238)
$noteLabel.Size = New-Object System.Drawing.Size(200,20)
$form.Controls.Add($noteLabel)

$noteBox = New-Object System.Windows.Forms.TextBox
$noteBox.Multiline = $true
$noteBox.ScrollBars = "Vertical"
$noteBox.Location = New-Object System.Drawing.Point(10,260)
$noteBox.Size = New-Object System.Drawing.Size(484,60)
$form.Controls.Add($noteBox)

$passBtn = New-Object System.Windows.Forms.Button
$passBtn.Text = "PASS"
$passBtn.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$passBtn.Location = New-Object System.Drawing.Point(300,335)
$passBtn.Size = New-Object System.Drawing.Size(90,30)
$form.Controls.Add($passBtn)
$form.AcceptButton = $passBtn

$failBtn = New-Object System.Windows.Forms.Button
$failBtn.Text = "FAIL"
$failBtn.DialogResult = [System.Windows.Forms.DialogResult]::No
$failBtn.Location = New-Object System.Drawing.Point(400,335)
$failBtn.Size = New-Object System.Drawing.Size(90,30)
$form.Controls.Add($failBtn)
$form.CancelButton = $failBtn

$dialogResult = $form.ShowDialog()

$verdict = "no"
if ($dialogResult -eq [System.Windows.Forms.DialogResult]::Yes) { $verdict = "yes" }

$payload = @{ result = $verdict; note = $noteBox.Text } | ConvertTo-Json -Compress
[Console]::Out.Write($payload)
`;

/**
 * Show a blocking Windows dialog (PASS / FAIL + an optional free-text note)
 * spawned by THIS (server) process, and resolve with the human's verdict. This
 * is the primary out-of-band channel for manual/review verification; MCP
 * elicitation is only used as a fallback where a popup cannot run (non-Windows
 * hosts).
 *
 * The dialog belongs to the server process — Claude cannot programmatically
 * answer another process's modal dialog through normal tool use. Message and
 * title are passed via environment variables to avoid shell-escaping issues.
 *
 * No timeout: the human may take a while to respond, so the dialog waits
 * indefinitely rather than auto-failing on a clock. Resolves `{ result: "no" }`
 * on any launch failure, on a non-Windows host, or when the human explicitly
 * clicks FAIL / closes the dialog — callers MUST treat anything other than
 * "yes" as a failed verification so a missing human can never yield a pass.
 */
export function showVerifyDialog(title: string, body: string): Promise<VerifyDialogResult> {
  if (!isWindows) return Promise.resolve({ result: "no" });

  return new Promise((resolve) => {
    try {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", VERIFY_DIALOG_SCRIPT], {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        env: {
          ...process.env,
          DODG_MSG: body,
          DODG_TITLE: title,
        },
      });

      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk.toString();
      });
      child.on("error", () => resolve({ result: "no" }));
      child.on("close", () => {
        try {
          const parsed = JSON.parse(out.trim()) as { result?: string; note?: string };
          const result = parsed.result === "yes" ? "yes" : "no";
          const note = typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : undefined;
          resolve({ result, note });
        } catch {
          resolve({ result: "no" });
        }
      });
    } catch {
      resolve({ result: "no" });
    }
  });
}
