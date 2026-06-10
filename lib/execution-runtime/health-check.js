const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_INTERVAL_MS = 750;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForHealthyApp(port, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const intervalMs = Number(options.intervalMs || DEFAULT_INTERVAL_MS);
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  let lastStatus = null;

  while (Date.now() < deadline) {
    let timer;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), Math.min(2000, intervalMs));
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      lastStatus = response.status;
      if (response.status === 200) {
        return { ready: true, statusCode: response.status, url };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }

    await delay(intervalMs);
  }

  return {
    ready: false,
    statusCode: lastStatus ?? undefined,
    error: lastError || `Timed out waiting for ${url}`,
    url,
  };
}
