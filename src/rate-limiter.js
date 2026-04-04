// ==========================================
// Provider Rate Limiter — token bucket with queuing
// ==========================================
// Prevents hitting API rate limits by queuing requests
// and releasing them at a controlled rate.

const buckets = new Map(); // provider -> { tokens, lastRefill, queue }

const DEFAULT_RATE = {
  tokensPerMinute: 60,   // max requests per minute
  burstSize: 10,         // max burst before queuing
};

// Per-provider rate configs (override via env)
function getRate(provider) {
  const envRate = process.env[`RATE_LIMIT_${provider.toUpperCase().replace(/-/g, '_')}_RPM`];
  if (envRate) {
    const rpm = parseInt(envRate);
    return { tokensPerMinute: rpm, burstSize: Math.ceil(rpm / 6) };
  }
  return DEFAULT_RATE;
}

function getBucket(provider) {
  if (!buckets.has(provider)) {
    const rate = getRate(provider);
    buckets.set(provider, {
      tokens: rate.burstSize,
      lastRefill: Date.now(),
      rate,
      queue: [],
    });
  }
  return buckets.get(provider);
}

function refillTokens(bucket) {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / 60000) * bucket.rate.tokensPerMinute;
  bucket.tokens = Math.min(bucket.rate.burstSize, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

/**
 * Acquire a token for the given provider. Resolves when a token is available.
 */
export function acquireToken(provider) {
  const bucket = getBucket(provider);
  refillTokens(bucket);

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return Promise.resolve();
  }

  // Queue the request
  return new Promise(resolve => {
    bucket.queue.push(resolve);
  });
}

// Drain queues periodically
setInterval(() => {
  for (const [, bucket] of buckets) {
    refillTokens(bucket);
    while (bucket.queue.length > 0 && bucket.tokens >= 1) {
      bucket.tokens -= 1;
      const resolve = bucket.queue.shift();
      resolve();
    }
  }
}, 1000).unref();
