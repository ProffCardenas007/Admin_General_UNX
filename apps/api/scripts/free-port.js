const { execSync } = require("child_process");

const portArg = process.argv[2];
const port = Number(portArg || 4000);

if (!Number.isInteger(port) || port <= 0) {
  console.error("Invalid port. Usage: node scripts/free-port.js <port>");
  process.exit(1);
}

function getPidsOnWindows(targetPort) {
  const output = execSync(`netstat -ano -p tcp | findstr :${targetPort}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return [...new Set(output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("LISTENING"))
    .map((line) => line.split(/\s+/).pop())
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0))];
}

function getPidsOnUnix(targetPort) {
  const output = execSync(`lsof -ti tcp:${targetPort} -sTCP:LISTEN`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  return [...new Set(output
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0))];
}

function getListeningPids(targetPort) {
  try {
    if (process.platform === "win32") {
      return getPidsOnWindows(targetPort);
    }

    return getPidsOnUnix(targetPort);
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (pid === process.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, {
        stdio: ["ignore", "ignore", "ignore"],
      });
    } else {
      process.kill(pid, "SIGKILL");
    }

    console.log(`Freed port ${port} by stopping PID ${pid}.`);
  } catch {
    console.warn(`Could not stop PID ${pid}.`);
  }
}

const pids = getListeningPids(port);
if (pids.length === 0) {
  console.log(`Port ${port} is already free.`);
  process.exit(0);
}

pids.forEach(killPid);
