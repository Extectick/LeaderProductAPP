const { execFileSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function normalizePathForMatch(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

function ownsExpoProcess(processInfo, root = projectRoot) {
  const commandLine = normalizePathForMatch(processInfo?.commandLine);
  const normalizedRoot = normalizePathForMatch(root);
  if (!commandLine || !commandLine.includes(normalizedRoot)) return false;
  return commandLine.includes('/expo/bin/cli')
    || commandLine.includes('/metro/')
    || commandLine.includes('metro-config')
    || commandLine.includes('react-native/cli');
}

function windowsListeners(port) {
  const script = [
    `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    '$items = @()',
    '$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {',
    '  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $_" -ErrorAction SilentlyContinue',
    '  if ($process) {',
    '    $items += [PSCustomObject]@{ pid = [int]$process.ProcessId; commandLine = [string]$process.CommandLine }',
    '  }',
    '}',
    'if ($items.Count -gt 0) { ConvertTo-Json -InputObject @($items) -Compress }',
  ].join('; ');
  const output = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true }
  ).trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function posixListeners(port) {
  let output = '';
  try {
    output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  } catch (error) {
    if (error?.status === 1) return [];
    throw error;
  }
  const pids = Array.from(new Set(output.split(/\s+/).map(Number).filter(Number.isInteger)));
  return pids.map((pid) => {
    let commandLine = '';
    try {
      commandLine = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
    } catch {
      // Ownership verification below will reject a process with no command line.
    }
    return { pid, commandLine };
  });
}

function listeners(port) {
  return process.platform === 'win32' ? windowsListeners(port) : posixListeners(port);
}

function stopProcessTree(pid) {
  if (process.platform === 'win32') {
    execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    });
    return;
  }
  process.kill(pid, 'SIGTERM');
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function freePreviousExpoPort(port) {
  const current = listeners(port);
  if (!current.length) return;

  const foreign = current.filter((item) => !ownsExpoProcess(item));
  if (foreign.length) {
    const details = foreign.map((item) => `PID ${item.pid}: ${item.commandLine || 'командная строка недоступна'}`).join('\n');
    throw new Error(
      `Порт ${port} занят процессом, который не относится к ${projectRoot}. Автоматическое завершение отменено.\n${details}`
    );
  }

  for (const item of current) {
    console.log(`[dev-client] Завершаю предыдущий Expo/Metro на порту ${port} (PID ${item.pid})...`);
    stopProcessTree(item.pid);
  }

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if (!listeners(port).length) {
      console.log(`[dev-client] Порт ${port} освобождён.`);
      return;
    }
    wait(200);
  }
  throw new Error(`Expo/Metro завершён, но порт ${port} не освободился за 7 секунд.`);
}

function main() {
  const port = Number(process.argv[2] || 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Некорректный порт: ${process.argv[2] || ''}`);
  }
  freePreviousExpoPort(port);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[dev-client] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

module.exports = {
  freePreviousExpoPort,
  normalizePathForMatch,
  ownsExpoProcess,
};
