param([ValidateSet('Enable', 'Disable')][string]$Action = 'Enable')
$ErrorActionPreference = 'Stop'
$ruleName = 'SophiaPartyPlayground-LAN-Preview'
$ruleGroup = 'SophiaPartyPlayground local preview'
$taskRoot = Split-Path -Parent $PSScriptRoot
$resultPath = Join-Path $taskRoot '.sites-runtime/lan-firewall-result.json'
function Save-Result([bool]$Success, [string]$Message) {
    @{ action = $Action; success = $Success; message = $Message; rule = $ruleName; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
}
try {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator approval is required to change the preview firewall rule.' }
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing -and $existing.Group -ne $ruleGroup) { throw 'The firewall rule name belongs to another configuration.' }
    if ($Action -eq 'Disable') {
        if ($existing) { Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop }
        Write-Output 'Removed the Sophia LAN preview rule. Other firewall rules are unchanged.'
        Save-Result $true $null
        return
    }
    $preview = Get-Content -LiteralPath (Join-Path $taskRoot '.sites-runtime/lan-preview.json') -Raw | ConvertFrom-Json
    $endpoint = [uri]$preview.origin
    $ip = $endpoint.Host
    if ($endpoint.Scheme -ne 'http' -or $ip -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' -or $endpoint.Port -ne 5174) { throw 'Expected the private Wi-Fi preview on port 5174.' }
    if ($preview.remoteSubnet -notmatch '^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$' -or -not $preview.interfaceAlias) { throw 'Invalid preview network metadata.' }
    $nodeProgram = (Get-Process -Id $preview.pid).Path
    if ((Get-Command node -CommandType Application).Source -notcontains $nodeProgram) { throw 'The preview process is not a configured Node runtime.' }
    if ((Get-NetTCPConnection -State Listen -LocalAddress $ip -LocalPort $endpoint.Port).OwningProcess -notcontains [int]$preview.pid) { throw 'Start the managed LAN preview before opening its port.' }
    if ($existing) { Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop }
    New-NetFirewallRule -Name $ruleName -DisplayName 'Sophia iPhone Wi-Fi preview (5174)' -Group $ruleGroup -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalAddress $ip -LocalPort $endpoint.Port -RemoteAddress $preview.remoteSubnet -InterfaceAlias $preview.interfaceAlias -Program $nodeProgram -Profile Any -ErrorAction Stop | Out-Null
    $applied = Get-NetFirewallRule -Name $ruleName -ErrorAction Stop
    if ($applied.Enabled -ne 'True' -or $applied.Action -ne 'Allow') { throw 'The preview rule was not enabled.' }
    $applied | Select-Object Name,Enabled,Profile,Direction,Action
    Write-Output "Allowed $($preview.remoteSubnet) -> $($endpoint.Authority), interface $($preview.interfaceAlias), Node only."
    Save-Result $true $null
} catch {
    Save-Result $false $_.Exception.Message
    throw
}
